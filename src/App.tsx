/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, ArrowRight, Ruler, Navigation, Info, RefreshCw } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

export default function App() {
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [endPoint, setEndPoint] = useState<Point | null>(null);
  const [activeTab, setActiveTab] = useState<'deslocamento' | 'velocidade' | 'aceleracao'>('deslocamento');
  const [showVector, setShowVector] = useState(true);
  const [showScalar, setShowScalar] = useState(true);
  const [showVelocity, setShowVelocity] = useState(true);
  const [showAcceleration, setShowAcceleration] = useState(true);
  const [scalarPathType, setScalarPathType] = useState(0); // 0: H-V, 1: V-H, 2: Zig-Zag

  // State for simulation tabs
  const [frequency, setFrequency] = useState(0.2); // Hz
  const [rectVelocity, setRectVelocity] = useState(50); // px/s
  const [rectAccel, setRectAccel] = useState(10); // px/s^2
  const [circAccel, setCircAccel] = useState(5); // m/s^2 for circular motion
  const [time, setTime] = useState(0);
  const [theta, setTheta] = useState(0); // For MCV (Variable)
  const [thetaMCU, setThetaMCU] = useState(0); // For MCU (Constant speed)

  // Using a more standard ref pattern for the loop
  const freqRef = useRef(frequency);
  const accelRef = useRef(circAccel);
  const tabRef = useRef(activeTab);

  useEffect(() => {
    freqRef.current = frequency;
    accelRef.current = circAccel;
    tabRef.current = activeTab;
  }, [frequency, circAccel, activeTab]);

  // Animation loop
  useEffect(() => {
    let animationFrame: number;
    let lastTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      
      setTime(prev => prev + delta);

      // We stop auto-updating the global 'frequency' state to ensure 
      // Section 2 (MCU) maintains a constant speed based on the slider.
      
      // thetaMCU (Section 2 - MCU): Constant angular velocity
      setThetaMCU(prev => prev + (2 * Math.PI * freqRef.current) * delta);

      // theta (Section 3 - MCV): Variable angular velocity
      const R = 100;
      const alpha = accelRef.current / R;
      const t = time % 10;
      const omegaInstant = (2 * Math.PI * freqRef.current) + alpha * t;
      setTheta(prev => prev + Math.max(0, omegaInstant) * delta);

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const gridSize = 5; // 5x5 points for 4x4 blocks
  const cellSize = 80; // Slightly smaller cells to fit 4x4 better
  const padding = 40;
  const svgSize = (gridSize - 1) * cellSize + padding * 2;

  const handlePointClick = (x: number, y: number) => {
    if (!startPoint || (startPoint && endPoint)) {
      setStartPoint({ x, y });
      setEndPoint(null);
    } else {
      if (startPoint.x === x && startPoint.y === y) return;
      setEndPoint({ x, y });
    }
  };

  const reset = () => {
    setStartPoint(null);
    setEndPoint(null);
  };

  const resetTime = () => {
    setTime(0);
  };

  const calculations = useMemo(() => {
    if (!startPoint || !endPoint) return null;
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const vectorMagnitude = Math.sqrt(dx * dx + dy * dy);
    const scalarDistance = Math.abs(dx) + Math.abs(dy);
    
    // Convert to "meters" (assuming each block is 100m)
    const blockSizeMeters = 100;
    return {
      vector: vectorMagnitude * blockSizeMeters,
      scalar: scalarDistance * blockSizeMeters,
      dx,
      dy
    };
  }, [startPoint, endPoint]);

  const scalarLabelPos = useMemo(() => {
    if (!startPoint || !endPoint) return { x: 0, y: 0 };
    
    const startX = startPoint.x * cellSize + padding;
    const startY = startPoint.y * cellSize + padding;
    const endX = endPoint.x * cellSize + padding;
    const endY = endPoint.y * cellSize + padding;
    
    if (scalarPathType === 0) {
      // Corner is (endX, startY)
      return { x: endX + 10, y: startY - 10 };
    } else if (scalarPathType === 1) {
      // Corner is (startX, endY)
      return { x: startX - 30, y: endY + 20 };
    } else {
      // Staircase - use midpoint of start and end
      return { x: (startX + endX) / 2 + 15, y: (startY + endY) / 2 - 15 };
    }
  }, [startPoint, endPoint, scalarPathType]);

  // Generate path for scalar displacement (Manhattan path)
  const scalarPath = useMemo(() => {
    if (!startPoint || !endPoint) return "";
    const startX = startPoint.x * cellSize + padding;
    const startY = startPoint.y * cellSize + padding;
    const endX = endPoint.x * cellSize + padding;
    const endY = endPoint.y * cellSize + padding;

    let path = `M ${startX} ${startY}`;

    if (scalarPathType === 0) {
      // Horizontal then Vertical
      path += ` L ${endX} ${startY}`;
      path += ` L ${endX} ${endY}`;
    } else if (scalarPathType === 1) {
      // Vertical then Horizontal
      path += ` L ${startX} ${endY}`;
      path += ` L ${endX} ${endY}`;
    } else {
      // Zig-Zag / Staircase
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      let remX = Math.abs(dx);
      let remY = Math.abs(dy);
      const totalSteps = remX + remY;
      
      let curX = startPoint.x;
      let curY = startPoint.y;
      
      for (let i = 0; i < totalSteps; i++) {
        // Try to alternate, but respect remaining steps
        const preferX = i % 2 === 0;
        if ((preferX && remX > 0) || remY === 0) {
          curX += Math.sign(dx);
          remX--;
        } else {
          curY += Math.sign(dy);
          remY--;
        }
        path += ` L ${curX * cellSize + padding} ${curY * cellSize + padding}`;
      }
    }
    return path;
  }, [startPoint, endPoint, scalarPathType]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Navigation className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Cinemática Vetorial - Prof. Grossi</h1>
        </div>
        <nav className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('deslocamento')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'deslocamento' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Deslocamento
          </button>
          <button
            onClick={() => setActiveTab('velocidade')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'velocidade' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Velocidade Vetorial
          </button>
          <button
            onClick={() => setActiveTab('aceleracao')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'aceleracao' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Aceleração Vetorial
          </button>
        </nav>
      </header>
      {activeTab === 'deslocamento' ? (
        <main className="max-w-4xl mx-auto p-6 space-y-8">
          {/* Instructions Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-indigo-500" />
              Instruções
            </h2>
            <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
              <p>
                1. Clique em uma interseção para marcar o <strong>ponto de partida</strong>.
              </p>
              <p>
                2. Clique em outra interseção para marcar o <strong>ponto de chegada</strong>.
              </p>
              <p>
                3. O aplicativo mostrará o deslocamento vetorial (reta) e o deslocamento escalar (pelas ruas).
              </p>
            </div>
            
            <button 
              onClick={reset}
              className="mt-6 w-full sm:w-auto flex items-center justify-center gap-2 py-2.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reiniciar
            </button>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setShowVector(!showVector)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all border-2 ${
                  showVector 
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                    : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                {showVector ? 'Ocultar d⃗' : 'Mostrar d⃗'}
              </button>
              <button
                onClick={() => setShowScalar(!showScalar)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all border-2 ${
                  showScalar 
                    ? 'bg-amber-50 border-amber-200 text-amber-700' 
                    : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                {showScalar ? 'Ocultar ΔS' : 'Mostrar ΔS'}
              </button>
            </div>

            {showScalar && startPoint && endPoint && (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold text-center">Alternar Trajetória Escalar</p>
                <div className="flex gap-2">
                  {['Horizontal-Vertical', 'Vertical-Horizontal', 'Zigue-Zague'].map((label, idx) => (
                    <button
                      key={label}
                      onClick={() => setScalarPathType(idx)}
                      className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold transition-all border ${
                        scalarPathType === idx
                          ? 'bg-amber-500 border-amber-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 italic text-center mt-1">
                  Note que o valor de ΔS permanece o mesmo para qualquer trajetória mínima.
                </p>
              </div>
            )}
          </section>

          {/* Interactive Grid (Figura) */}
          <div className="flex flex-col items-center">
            <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-xl border border-slate-200 relative overflow-hidden w-full max-w-[600px]">
              <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 opacity-20" />
              
              <svg 
                viewBox={`0 0 ${svgSize} ${svgSize}`} 
                className="w-full h-auto cursor-crosshair select-none"
              >
                {/* City Blocks (4x4) */}
                {Array.from({ length: gridSize - 1 }).map((_, i) => (
                  Array.from({ length: gridSize - 1 }).map((_, j) => (
                    <rect
                      key={`block-${i}-${j}`}
                      x={i * cellSize + padding + 10}
                      y={j * cellSize + padding + 10}
                      width={cellSize - 20}
                      height={cellSize - 20}
                      rx="8"
                      fill="#f1f5f9"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                  ))
                ))}

                {/* Streets (Grid Lines) */}
                {Array.from({ length: gridSize }).map((_, i) => (
                  <line
                    key={`h-line-${i}`}
                    x1={padding}
                    y1={i * cellSize + padding}
                    x2={svgSize - padding}
                    y2={i * cellSize + padding}
                    stroke="#000000"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                ))}
                {Array.from({ length: gridSize }).map((_, i) => (
                  <line
                    key={`v-line-${i}`}
                    x1={i * cellSize + padding}
                    y1={padding}
                    x2={i * cellSize + padding}
                    y2={svgSize - padding}
                    stroke="#000000"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Scalar Path (Manhattan) */}
                {startPoint && endPoint && showScalar && (
                  <g>
                    <motion.path
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      d={scalarPath}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-60"
                    />
                    {/* Label for Scalar Displacement */}
                    <text
                      x={scalarLabelPos.x}
                      y={scalarLabelPos.y}
                      fontSize="16"
                      fontWeight="bold"
                      fill="#d97706"
                      className="drop-shadow-sm"
                    >
                      ΔS
                    </text>
                  </g>
                )}

                {/* Vector Displacement Arrow */}
                {startPoint && endPoint && showVector && (
                  <g>
                    <defs>
                      <marker
                        id="arrowhead"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7"
                        refY="4"
                        orient="auto"
                      >
                        <polygon points="0 0, 8 4, 0 8" fill="#4f46e5" />
                      </marker>
                    </defs>
                    <motion.line
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      x1={startPoint.x * cellSize + padding}
                      y1={startPoint.y * cellSize + padding}
                      x2={endPoint.x * cellSize + padding}
                      y2={endPoint.y * cellSize + padding}
                      stroke="#4f46e5"
                      strokeWidth="3"
                      markerEnd="url(#arrowhead)"
                    />
                    {/* Label for Vector Displacement */}
                    <text
                      x={(startPoint.x + endPoint.x) / 2 * cellSize + padding - 20}
                      y={(startPoint.y + endPoint.y) / 2 * cellSize + padding - 10}
                      fontSize="16"
                      fontWeight="bold"
                      fill="#4f46e5"
                      className="drop-shadow-sm"
                    >
                      d⃗
                    </text>
                  </g>
                )}

                {/* Intersections (Clickable Points) */}
                {Array.from({ length: gridSize }).map((_, i) => (
                  Array.from({ length: gridSize }).map((_, j) => {
                    const isStart = startPoint?.x === i && startPoint?.y === j;
                    const isEnd = endPoint?.x === i && endPoint?.y === j;
                    
                    return (
                      <circle
                        key={`point-${i}-${j}`}
                        cx={i * cellSize + padding}
                        cy={j * cellSize + padding}
                        r={isStart || isEnd ? 8 : 12}
                        fill={isStart ? "#4f46e5" : isEnd ? "#ef4444" : "transparent"}
                        className="hover:fill-slate-200/50 transition-colors cursor-pointer"
                        onClick={() => handlePointClick(i, j)}
                      />
                    );
                  })
                ))}

                {/* Labels for Start and End */}
                {startPoint && (
                  <g transform={`translate(${startPoint.x * cellSize + padding}, ${startPoint.y * cellSize + padding - 20})`}>
                    <text textAnchor="middle" fontSize="12" fontWeight="bold" fill="#4f46e5">INÍCIO</text>
                  </g>
                )}
                {endPoint && (
                  <g transform={`translate(${endPoint.x * cellSize + padding}, ${endPoint.y * cellSize + padding - 20})`}>
                    <text textAnchor="middle" fontSize="12" fontWeight="bold" fill="#ef4444">FIM</text>
                  </g>
                )}
              </svg>

              <div className="mt-6 flex flex-wrap justify-center gap-6 text-xs text-slate-400 font-medium uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-indigo-600 rounded-full" />
                  <span>Deslocamento Vetorial</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-400 rounded-full" />
                  <span>Deslocamento Escalar</span>
                </div>
              </div>
            </div>
          </div>

          {/* Results Section */}
          <AnimatePresence>
            {calculations && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-indigo-600 p-6 rounded-2xl shadow-lg text-white"
              >
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Ruler className="w-5 h-5" />
                  Resultados
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm">
                    <p className="text-indigo-100 text-xs uppercase tracking-wider font-bold mb-1">Deslocamento Vetorial (d⃗)</p>
                    <p className="text-3xl font-mono font-bold">
                      {calculations.vector.toFixed(2)} <span className="text-lg font-normal">m</span>
                    </p>
                    <p className="text-indigo-200 text-xs mt-1 italic">
                      A menor distância entre os pontos.
                    </p>
                  </div>
                  
                  <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm">
                    <p className="text-indigo-100 text-xs uppercase tracking-wider font-bold mb-1">Deslocamento Escalar (ΔS)</p>
                    <p className="text-3xl font-mono font-bold">
                      {calculations.scalar.toFixed(2)} <span className="text-lg font-normal">m</span>
                    </p>
                    <p className="text-indigo-200 text-xs mt-1 italic">
                      A distância percorrida pelas ruas.
                    </p>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </main>
      ) : activeTab === 'velocidade' ? (
        <main className="max-w-4xl mx-auto p-6 space-y-8">
          {/* Controls Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-indigo-500" />
              Instruções
            </h2>
            <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
              <p>
                1. Ajuste os parâmetros nos controles abaixo para alterar o movimento.
              </p>
              <p>
                2. Observe a representação do <strong>vetor velocidade (v⃗)</strong> em roxo no <strong>tomate</strong>.
              </p>
              <p>
                3. Note como o vetor velocidade é sempre <strong>tangente</strong> à trajetória no movimento circular.
              </p>
            </div>
            
            <button 
              onClick={resetTime}
              className="mt-6 w-full sm:w-auto flex items-center justify-center gap-2 py-2.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reiniciar Simulação
            </button>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setShowVelocity(!showVelocity)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all border-2 ${
                  showVelocity 
                    ? 'bg-purple-50 border-purple-200 text-purple-700' 
                    : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                {showVelocity ? 'Ocultar v⃗' : 'Mostrar v⃗'}
              </button>
            </div>
          </section>

          {/* Rectilinear Motion Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-slate-800">
              <ArrowRight className="w-5 h-5 text-indigo-500" />
              Movimento Retilíneo Uniformemente Variado (MRUV)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                      Velocidade Inicial (v₀): {rectVelocity.toFixed(0)} m/s
                    </label>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={rectVelocity} 
                      onChange={(e) => setRectVelocity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                      Aceleração (a): {rectAccel.toFixed(0)} m/s²
                    </label>
                    <input 
                      type="range" 
                      min="-20" 
                      max="50" 
                      value={rectAccel} 
                      onChange={(e) => setRectAccel(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>

                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                  <p className="text-indigo-600 text-xs font-bold uppercase mb-2">Velocidade Instantânea (v)</p>
                  <p className="text-2xl font-mono font-bold text-indigo-900">
                    {Math.max(0, rectVelocity + rectAccel * (time % 5)).toFixed(2)} <span className="text-sm font-normal">m/s</span>
                  </p>
                  <p className="text-indigo-400 text-[10px] mt-1">v = v₀ + a · t (reinicia a cada 5s para visualização)</p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 h-[200px] flex items-center justify-center relative overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet">
                  {/* Track */}
                  <line x1="20" y1="75" x2="380" y2="75" stroke="#000000" strokeWidth="2" strokeDasharray="5 5" />
                  
                  {(() => {
                    // Calculate time to reach the end (360px)
                    // 0.5 * a * t^2 + v0 * t - 360 = 0
                    let tEnd = 5; // Default fallback
                    const v0 = rectVelocity;
                    const a = rectAccel;
                    
                    if (a === 0) {
                      if (v0 > 0) tEnd = 360 / v0;
                    } else {
                      const delta = v0 * v0 + 2 * a * 360;
                      if (delta >= 0) {
                        const t1 = (-v0 + Math.sqrt(delta)) / a;
                        const t2 = (-v0 - Math.sqrt(delta)) / a;
                        // Pick the smallest positive time
                        const positiveTimes = [t1, t2].filter(t => t > 0);
                        if (positiveTimes.length > 0) {
                          tEnd = Math.min(...positiveTimes);
                        }
                      }
                    }

                    const t = time % tEnd;
                    const v = Math.max(0, v0 + a * t);
                    // s = v0*t + 0.5*a*t^2
                    const rawPos = (v0 * t + 0.5 * a * t * t);
                    const pos = 20 + (rawPos % 361); // Using 361 to ensure it reaches the end visual
                    
                    const vectorScale = 0.5;
                    const vx = v * vectorScale;

                    return (
                      <g>
                        {/* Velocity Vector Arrow */}
                        {v > 0 && showVelocity && (
                          <g>
                            <line 
                              x1={pos} 
                              y1={75} 
                              x2={pos + vx} 
                              y2={75} 
                              stroke="#9333ea" 
                              strokeWidth="3" 
                              markerEnd="url(#v-arrow)" 
                            />
                            <text 
                              x={pos + vx / 2} 
                              y="60" 
                              fill="#9333ea" 
                              fontWeight="bold" 
                              fontSize="12" 
                              textAnchor="middle"
                            >
                              v⃗
                            </text>
                          </g>
                        )}
                        
                        {/* Object (Tomato) */}
                        <g transform={`translate(${pos}, 75)`}>
                          <circle cx="0" cy="0" r="10" fill="#ef4444" />
                          <path d="M -3,-9 L 0,-12 L 3,-9 L 0,-7 Z" fill="#16a34a" />
                          <path d="M -5,-7 L -2,-9 M 5,-7 L 2,-9" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
                        </g>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>
          </section>

          {/* Circular Motion Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-slate-800">
              <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin-slow" />
              Movimento Circular Uniforme (MCU)
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                    Frequência (f): {frequency.toFixed(2)} Hz
                  </label>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="0.4" 
                    step="0.01" 
                    value={frequency} 
                    onChange={(e) => setFrequency(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                  <p className="text-indigo-600 text-xs font-bold uppercase mb-2">Velocidade Escalar (v)</p>
                  <p className="text-2xl font-mono font-bold text-indigo-900">
                    {(2 * Math.PI * frequency * 100).toFixed(2)} <span className="text-sm font-normal">m/s</span>
                  </p>
                  <p className="text-indigo-400 text-[10px] mt-1">v = 2π · f · R (considerando R = 100m)</p>
                </div>
              </div>

              <div className="flex justify-center">
                <svg width="300" height="300" viewBox="0 0 300 300">
                  {/* Circle Path */}
                  <circle cx="150" cy="150" r="100" fill="none" stroke="#000000" strokeWidth="2" strokeDasharray="5 5" />
                  
                  {/* Quadrant Dividers */}
                  <line x1="150" y1="50" x2="150" y2="250" stroke="#000000" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="50" y1="150" x2="250" y2="150" stroke="#000000" strokeWidth="1" strokeDasharray="4 4" />
                  
                  {(() => {
                    const angle = 2 * Math.PI * frequency * time;
                    const x = 150 + 100 * Math.cos(angle);
                    const y = 150 + 100 * Math.sin(angle);
                    
                    // Scalar velocity: v = 2 * pi * f * R
                    const vScalar = 2 * Math.PI * frequency * 100;
                    // Adjusted scale factor for a maximum frequency of 0.4Hz
                    const vectorScale = 0.4;
                    const magnitude = vScalar * vectorScale;
                    
                    // Velocity vector components (tangent)
                    const vx = -Math.sin(angle) * magnitude;
                    const vy = Math.cos(angle) * magnitude;
                    
                    return (
                      <g>
                        {/* Velocity Vector Arrow */}
                        <defs>
                          <marker id="v-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                            <polygon points="0 0, 6 3, 0 6" fill="#9333ea" />
                          </marker>
                        </defs>
                        {showVelocity && (
                          <g>
                            <line x1={x} y1={y} x2={x + vx} y2={y + vy} stroke="#9333ea" strokeWidth="2" markerEnd="url(#v-arrow)" />
                            <text x={x + vx + 5} y={y + vy + 5} fill="#9333ea" fontWeight="bold" fontSize="14">v⃗</text>
                          </g>
                        )}
                        
                        {/* Object (Tomato) */}
                        <g transform={`translate(${x}, ${y})`}>
                          <circle cx="0" cy="0" r="8" fill="#ef4444" />
                          <path d="M -2.5,-7.5 L 0,-10 L 2.5,-7.5 L 0,-5.5 Z" fill="#16a34a" />
                          <path d="M -4,-6 L -1.5,-7.5 M 4,-6 L 1.5,-7.5" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" />
                        </g>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className="max-w-4xl mx-auto p-6 space-y-12">
          {/* Instructions/Controls Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-indigo-500" />
              Instruções
            </h2>
            <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
              <p>
                1. Observe como a <strong>aceleração tangencial (aₜ)</strong> altera a rapidez e a <strong>aceleração centrípeta (a꜀)</strong> altera a direção.
              </p>
              <p>
                2. Use os botões abaixo para alternar a visibilidade dos vetores.
              </p>
            </div>
            
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setShowVelocity(!showVelocity)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all border-2 ${
                  showVelocity 
                    ? 'bg-purple-50 border-purple-200 text-purple-700' 
                    : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                {showVelocity ? 'Ocultar v⃗' : 'Mostrar v⃗'}
              </button>
              <button
                onClick={() => setShowAcceleration(!showAcceleration)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all border-2 ${
                  showAcceleration 
                    ? 'bg-orange-50 border-orange-200 text-orange-700' 
                    : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                {showAcceleration ? 'Ocultar a⃗' : 'Mostrar a⃗'}
              </button>
            </div>
          </section>

          {/* Aceleração Tangencial Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <header className="mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ArrowRight className="w-6 h-6 text-orange-500" />
                1. Aceleração Tangencial (Movimento Retilíneo)
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                A aceleração tangencial altera o <strong>módulo</strong> da velocidade.
              </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                      Velocidade Inicial (v₀): {rectVelocity.toFixed(0)} m/s
                    </label>
                    <input 
                      type="range" min="0" max="100" value={rectVelocity} 
                      onChange={(e) => setRectVelocity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                      Aceleração (aₜ): {rectAccel.toFixed(0)} m/s²
                    </label>
                    <input 
                      type="range" min="-50" max="50" value={rectAccel} 
                      onChange={(e) => setRectAccel(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-purple-50 p-3 rounded-xl border border-purple-100">
                    <p className="text-purple-600 text-[10px] font-bold uppercase">Velocidade (v)</p>
                    <p className="text-xl font-mono font-bold text-purple-900">
                      {Math.max(0, rectVelocity + rectAccel * (time % 5)).toFixed(1)} <span className="text-xs font-normal">m/s</span>
                    </p>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-xl border border-orange-100">
                    <p className="text-orange-600 text-[10px] font-bold uppercase">Acel. Tangencial (aₜ)</p>
                    <p className="text-xl font-mono font-bold text-orange-900">
                      {rectAccel.toFixed(0)} <span className="text-xs font-normal">m/s²</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 h-[180px] flex items-center justify-center relative overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <marker id="v-arrow-purple" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <polygon points="0 0, 6 3, 0 6" fill="#9333ea" />
                    </marker>
                    <marker id="a-arrow-orange" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <polygon points="0 0, 6 3, 0 6" fill="#f97316" />
                    </marker>
                  </defs>
                  <line x1="20" y1="75" x2="380" y2="75" stroke="#000000" strokeWidth="2" strokeDasharray="5 5" />
                  
                  {(() => {
                    let tEnd = 5;
                    const v0 = rectVelocity;
                    const a = rectAccel;
                    if (a === 0) { if (v0 > 0) tEnd = 360 / v0; }
                    else {
                      const delta = v0 * v0 + 2 * a * 360;
                      if (delta >= 0) {
                        const t1 = (-v0 + Math.sqrt(delta)) / a;
                        const t2 = (-v0 - Math.sqrt(delta)) / a;
                        const positiveTimes = [t1, t2].filter(t => t > 0);
                        if (positiveTimes.length > 0) tEnd = Math.min(...positiveTimes);
                      }
                    }
                    const t = time % tEnd;
                    const v = Math.max(0, v0 + a * t);
                    const pos = 20 + ((v0 * t + 0.5 * a * t * t) % 361);
                    
                    return (
                      <g>
                        {/* Velocity Vector */}
                        {v > 0 && showVelocity && (
                          <line x1={pos} y1="65" x2={pos + v * 0.5} y2="65" stroke="#9333ea" strokeWidth="2.5" markerEnd="url(#v-arrow-purple)" />
                        )}
                        {/* Acceleration Vector */}
                        {Math.abs(a) > 0 && showAcceleration && (
                          <line x1={pos} y1="85" x2={pos + a * 2.0} y2="85" stroke="#f97316" strokeWidth="2.5" markerEnd="url(#a-arrow-orange)" />
                        )}
                        {showVelocity && <text x={pos + v * 0.25} y="55" fill="#9333ea" fontWeight="bold" fontSize="10" textAnchor="middle">v⃗</text>}
                        {showAcceleration && <text x={pos + a * 1.0} y="105" fill="#f97316" fontWeight="bold" fontSize="10" textAnchor="middle">aₜ</text>}
                        <g transform={`translate(${pos}, 75)`}>
                          <circle cx="0" cy="0" r="8" fill="#ef4444" />
                          <path d="M -2,-7 L 0,-10 L 2,-7 L 0,-5 Z" fill="#16a34a" />
                        </g>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>
          </section>

          {/* Aceleração Centrípeta Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <header className="mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <RefreshCw className="w-6 h-6 text-orange-500" />
                2. Aceleração Centrípeta (Movimento Circular)
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                A aceleração centrípeta altera a <strong>direção</strong> da velocidade.
              </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                    Frequência (f): {frequency.toFixed(2)} Hz
                  </label>
                  <input 
                    type="range" min="0.1" max="0.4" step="0.01" value={frequency} 
                    onChange={(e) => setFrequency(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-purple-50 p-3 rounded-xl border border-purple-100">
                    <p className="text-purple-600 text-[10px] font-bold uppercase">Velocidade (v)</p>
                    <p className="text-xl font-mono font-bold text-purple-900">
                      {(2 * Math.PI * frequency * 100).toFixed(1)} <span className="text-xs font-normal">m/s</span>
                    </p>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-xl border border-orange-100">
                    <p className="text-orange-600 text-[10px] font-bold uppercase">Acel. Centrípeta (a꜀)</p>
                    <p className="text-xl font-mono font-bold text-orange-900">
                      {(Math.pow(2 * Math.PI * frequency, 2) * 100).toFixed(1)} <span className="text-xs font-normal">m/s²</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <svg width="280" height="280" viewBox="0 0 300 300">
                  <circle cx="150" cy="150" r="100" fill="none" stroke="#000000" strokeWidth="2" strokeDasharray="5 5" />
                  <line x1="150" y1="50" x2="150" y2="250" stroke="#000000" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="50" y1="150" x2="250" y2="150" stroke="#000000" strokeWidth="1" strokeDasharray="4 4" />
                  
                  {(() => {
                    // Use thetaMCU for constant speed simulation
                    const angle = thetaMCU;
                    const x = 150 + 100 * Math.cos(angle);
                    const y = 150 + 100 * Math.sin(angle);
                    const vScalar = 2 * Math.PI * frequency * 100;
                    const vx = -Math.sin(angle) * (vScalar * 0.4);
                    const vy = Math.cos(angle) * (vScalar * 0.4);
                    
                    // Centripetal acceleration points to center
                    const acMag = Math.pow(2 * Math.PI * frequency, 2) * 100 * 0.12;
                    const ax = -Math.cos(angle) * acMag;
                    const ay = -Math.sin(angle) * acMag;
                    
                    return (
                      <g>
                        {showVelocity && (
                          <g>
                            <line x1={x} y1={y} x2={x + vx} y2={y + vy} stroke="#9333ea" strokeWidth="2.5" markerEnd="url(#v-arrow-purple)" />
                            <text x={x + vx} y={y + vy - 5} fill="#9333ea" fontWeight="bold" fontSize="12">v⃗</text>
                          </g>
                        )}
                        {showAcceleration && (
                          <g>
                            <line x1={x} y1={y} x2={x + ax} y2={y + ay} stroke="#f97316" strokeWidth="2.5" markerEnd="url(#a-arrow-orange)" />
                            <text x={x + ax - 15} y={y + ay} fill="#f97316" fontWeight="bold" fontSize="12">a꜀</text>
                          </g>
                        )}
                        <g transform={`translate(${x}, ${y})`}>
                          <circle cx="0" cy="0" r="7" fill="#ef4444" />
                          <path d="M -2,-6 L 0,-9 L 2,-6 L 0,-4 Z" fill="#16a34a" />
                        </g>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>
          </section>

          {/* Aceleração Vetorial Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <header className="mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Navigation className="w-6 h-6 text-green-500" />
                3. Aceleração Vetorial (Resultante)
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                A aceleração resultante (a⃗) é a soma vetorial de aₜ e a꜀.
              </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                      Frequência (f): {frequency.toFixed(2)} Hz
                    </label>
                    <input 
                      type="range" min="0.1" max="0.3" step="0.01" value={frequency} 
                      onChange={(e) => setFrequency(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                      Acel. Escalar (aₜ): {circAccel.toFixed(0)} m/s²
                    </label>
                    <input 
                      type="range" min="-20" max="20" value={circAccel} 
                      onChange={(e) => setCircAccel(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                  <p className="text-green-600 text-xs font-bold uppercase mb-2">Aceleração Resultante (a)</p>
                  {(() => {
                    const R = 100;
                    const t = time % 10;
                    const omegaInstant = (2 * Math.PI * frequency) + (circAccel / R) * t;
                    const ac = Math.pow(Math.max(0, omegaInstant), 2) * R;
                    const at = circAccel;
                    const aTotal = Math.sqrt(ac * ac + at * at);
                    return (
                      <p className="text-2xl font-mono font-bold text-green-900">
                        {aTotal.toFixed(1)} <span className="text-sm font-normal">m/s²</span>
                      </p>
                    );
                  })()}
                  <p className="text-green-400 text-[10px] mt-1">a² = aₜ² + a꜀² (Valores instantâneos)</p>
                </div>
              </div>

              <div className="flex justify-center">
                <svg width="280" height="280" viewBox="0 0 300 300">
                  <defs>
                    <marker id="a-arrow-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <polygon points="0 0, 6 3, 0 6" fill="#22c55e" />
                    </marker>
                  </defs>
                  <circle cx="150" cy="150" r="100" fill="none" stroke="#000000" strokeWidth="2" strokeDasharray="5 5" />
                  <line x1="150" y1="50" x2="150" y2="250" stroke="#000000" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="50" y1="150" x2="250" y2="150" stroke="#000000" strokeWidth="1" strokeDasharray="4 4" />
                  
                  {(() => {
                    // Non-Uniform Circular Motion (MCV)
                    // R = 100, omega = omega0 + alpha * t
                    const R = 100;
                    const t = time % 10;
                    const alpha = circAccel / R;
                    const omega = Math.max(0, (2 * Math.PI * frequency) + alpha * t);
                    
                    const x = 150 + R * Math.cos(theta);
                    const y = 150 + R * Math.sin(theta);
                    
                    // Velocity vector: v = omega * R
                    const vScalar = omega * R;
                    const vMag = vScalar * 0.3;
                    const vx = -Math.sin(theta) * vMag;
                    const vy = Math.cos(theta) * vMag;
                    
                    // Centripetal acceleration: ac = omega^2 * R
                    const acMag = (omega * omega * R) * 0.12;
                    const acx = -Math.cos(theta) * acMag;
                    const acy = -Math.sin(theta) * acMag;
                    
                    // Tangential acceleration: at = circAccel
                    const atMag = circAccel * 2.0;
                    const atx = -Math.sin(theta) * atMag;
                    const aty = Math.cos(theta) * atMag;
                    
                    // Total acceleration vector (Resultant)
                    const ax = acx + atx;
                    const ay = acy + aty;
                    
                    return (
                      <g>
                        {/* Velocity */}
                        {vScalar > 0 && showVelocity && (
                          <g>
                            <line x1={x} y1={y} x2={x + vx} y2={y + vy} stroke="#9333ea" strokeWidth="2" markerEnd="url(#v-arrow-purple)" opacity="0.5" />
                            <text x={x + vx + 5} y={y + vy} fill="#9333ea" fontWeight="bold" fontSize="10">v⃗</text>
                          </g>
                        )}
                        
                        {/* Components */}
                        {showAcceleration && (
                          <g>
                            <line x1={x} y1={y} x2={x + acx} y2={y + acy} stroke="#f97316" strokeWidth="2" markerEnd="url(#a-arrow-orange)" />
                            <line x1={x} y1={y} x2={x + atx} y2={y + aty} stroke="#f97316" strokeWidth="2" markerEnd="url(#a-arrow-orange)" />
                            
                            {/* Resultant */}
                            <line x1={x} y1={y} x2={x + ax} y2={y + ay} stroke="#22c55e" strokeWidth="3" markerEnd="url(#a-arrow-green)" />
                            
                            <text x={x + acx - 10} y={y + acy} fill="#f97316" fontWeight="bold" fontSize="10">a꜀</text>
                            <text x={x + atx} y={y + aty + 10} fill="#f97316" fontWeight="bold" fontSize="10">aₜ</text>
                            <text x={x + ax + 5} y={y + ay + 5} fill="#22c55e" fontWeight="bold" fontSize="12">a⃗</text>
                          </g>
                        )}
                        
                        <g transform={`translate(${x}, ${y})`}>
                          <circle cx="0" cy="0" r="7" fill="#ef4444" />
                          <path d="M -2,-6 L 0,-9 L 2,-6 L 0,-4 Z" fill="#16a34a" />
                        </g>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>
          </section>
        </main>
      )}

    </div>
  );
}
