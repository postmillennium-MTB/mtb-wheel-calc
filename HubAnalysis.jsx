import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

// ── WHEEL SIZES ───────────────────────────────────────────────────────────────
const WHEEL_SIZES = {
  '29"':   { erd: 600, label: '29"  ISO 622' },
  '27.5"': { erd: 559, label: '27.5" ISO 584' },
  '26"':   { erd: 534, label: '26"  ISO 559' },
};

// ── PHYSICS ENGINE ────────────────────────────────────────────────────────────
function calcWheel({ d_ds, d_nds, pcd_ds, pcd_nds, erd_mm, t_ds, n_spokes }) {
  const EA   = 210e9 * Math.PI * 1e-6;          // 2.0 mm spoke
  const Ns   = Math.floor(n_spokes / 2);
  const R_E  = erd_mm / 2 / 1000;               // ERD radius (m)
  const R    = 0.311;                            // shear-centre radius (m)
  const EIL  = 50, EIR = 150, GJ = 40;
  const coeff = Math.PI / Math.pow(R, 3);
  const cos_x = Math.cos(4 * Math.PI * 3 / Ns); // 3-cross

  const T    = t_ds * 9.81;
  const Rfa  = pcd_ds  / 2 / 1000;
  const Rfb  = pcd_nds / 2 / 1000;
  const da   = d_ds  / 1000;
  const db   = d_nds / 1000;

  const r2a  = R_E**2 + Rfa**2 - 2*R_E*Rfa*cos_x;
  const r2b  = R_E**2 + Rfb**2 - 2*R_E*Rfb*cos_x;
  const La   = Math.sqrt(da**2 + r2a);
  const Lb   = Math.sqrt(db**2 + r2b);
  const sa   = da / La,  sb = db / Lb;

  const ratio = sa / sb;
  const Tnds  = T * ratio;

  const Ka   = EA / La,  Kb = EA / Lb;
  const kla  = T    / La + Ka * sa**2;
  const klb  = Tnds / Lb + Kb * sb**2;
  const kra  = T    / La + Ka * (r2a / (da**2 + r2a));
  const krb  = Tnds / Lb + Kb * (r2b / (db**2 + r2b));

  const Ksl  = (Ns / 2) * (kla + klb);
  const Ksr  = (Ns / 2) * (kra + krb);
  let   Cl   = 1 / (2 * Ksl),  Cr = 1 / (2 * Ksr);

  for (let m = 1; m <= Ns; m++) {
    const q = m * m;
    Cl += 1 / (Ksl + coeff * (EIL * (q-1)**2 + GJ * (q-1)));
    Cr += 1 / (Ksr + coeff * EIR * (q-1)**2);
  }
  const Kl = 1 / Cl / 1000;   // N/mm
  const Kr = 1 / Cr / 1000;

  // Weak side = NDS (rear) — smallest tension
  const Flat = Tnds * Kl * 1e3 / (EA * sb / Lb);
  const Frad = Tnds * Kr * 1e3 / (EA / Lb);

  return {
    ratio_pct : +(ratio * 100).toFixed(1),
    t_nds     : +(Tnds / 9.81).toFixed(1),
    beta_ds   : +(Math.asin(Math.min(sa,0.9999)) * 180 / Math.PI).toFixed(2),
    beta_nds  : +(Math.asin(Math.min(sb,0.9999)) * 180 / Math.PI).toFixed(2),
    K_lat     : +Kl.toFixed(1),
    K_rad     : +Kr.toFixed(0),
    F_lat_kgf : +(Flat / 9.81).toFixed(1),
    F_rad_kgf : +(Frad / 9.81).toFixed(1),
    L_ds_mm   : +(La * 1000).toFixed(1),
    L_nds_mm  : +(Lb * 1000).toFixed(1),
    ftf       : +(d_ds + d_nds).toFixed(1),
  };
}

// ── CHRIS KING PRESETS ────────────────────────────────────────────────────────
const PRESETS = [
  { id:'r142', short:'ISO 135/142', name:'CK ISO 135/142 Rear',      OLD:142, type:'rear',  d_ds:20.1, d_nds:33.9, pcd_ds:57.4, pcd_nds:57.4 },
  { id:'r148', short:'Boost 148',   name:'CK Boost 148×12 Rear',     OLD:148, type:'rear',  d_ds:24.0, d_nds:36.3, pcd_ds:57.4, pcd_nds:57.4 },
  { id:'r157', short:'Superbst 157',name:'CK Superboost 157×12 Rear',OLD:157, type:'rear',  d_ds:28.8, d_nds:40.3, pcd_ds:57.4, pcd_nds:57.4 },
  { id:'r157b',short:'DH G2 157',   name:'CK DH G2 150/157 Rear',    OLD:157, type:'rear',  d_ds:28.5, d_nds:39.6, pcd_ds:57.4, pcd_nds:57.4 },
  { id:'f100', short:'R45D 100F',   name:'CK R45D CL Front 100×12',  OLD:100, type:'front', d_ds:30.6, d_nds:22.3, pcd_ds:57.4, pcd_nds:57.4 },
  { id:'f110a',short:'Boost 6B 110F',name:'CK Boost 6-Bolt Front 110×15',OLD:110,type:'front',d_ds:36.3,d_nds:27.3,pcd_ds:57.4,pcd_nds:57.4 },
  { id:'f110b',short:'Boost CL 110F',name:'CK Boost CL Front 110×15', OLD:110, type:'front', d_ds:35.5, d_nds:27.5, pcd_ds:57.4, pcd_nds:57.4 },
];

// ── COLOURS ───────────────────────────────────────────────────────────────────
const rCol = (r, type) => {
  if (type === 'front') {
    if (r <= 112) return '#22c55e';
    if (r <= 128) return '#84cc16';
    return '#eab308';
  }
  if (r >= 90) return '#22c55e';
  if (r >= 80) return '#84cc16';
  if (r >= 70) return '#eab308';
  if (r >= 60) return '#f97316';
  return '#ef4444';
};
const gCol = (v, mx) => ['#ef4444','#f97316','#eab308','#84cc16','#22c55e'][Math.min(Math.floor(v/mx*5),4)];

// ── CROSS-SECTION SVG ─────────────────────────────────────────────────────────
function CrossSection({ d_ds, d_nds, pcd_ds, pcd_nds, OLD, type, width=320, compact=false }) {
  const H   = compact ? 110 : 160;
  const CX  = width / 2;
  const AY  = compact ? 44 : 62;
  const FH  = compact ? 16 : 26;
  const SC  = Math.min(width / (Math.max(OLD || (d_ds+d_nds+40), 80) + 20), 1.6);

  const dx  = CX + d_ds  * SC;
  const nx  = CX - d_nds * SC;
  const rx  = OLD ? CX + (OLD/2)*SC : dx + 10;
  const lx  = OLD ? CX - (OLD/2)*SC : nx - 10;
  const gid = `g${Math.random().toString(36).slice(2,7)}`;

  return (
    <svg width={width} height={H} style={{ display:'block', overflow:'visible' }}>
      <defs>
        <linearGradient id={`${gid}b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#1d4ed8"/>
          <stop offset="50%"  stopColor="#60a5fa"/>
          <stop offset="100%" stopColor="#1d4ed8"/>
        </linearGradient>
        <linearGradient id={`${gid}a`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#92400e"/>
          <stop offset="50%"  stopColor="#fbbf24"/>
          <stop offset="100%" stopColor="#92400e"/>
        </linearGradient>
      </defs>

      {/* Spoke lines */}
      <line x1={dx} y1={AY - pcd_ds*SC*0.18}  x2={CX} y2={compact?5:8} stroke="#f59e0b" strokeWidth={0.8} opacity={0.3}/>
      <line x1={nx} y1={AY - pcd_nds*SC*0.18} x2={CX} y2={compact?5:8} stroke="#3b82f6" strokeWidth={0.8} opacity={0.3}/>
      <circle cx={CX} cy={compact?5:8} r={3} fill="none" stroke="#1e3050" strokeWidth={1}/>
      {!compact && <text x={CX+8} y={12} fill="#1e3050" fontSize={7} fontFamily="monospace">RIM</text>}

      {/* OLD bracket */}
      {OLD && <>
        <line x1={lx} y1={AY-FH-10} x2={rx} y2={AY-FH-10} stroke="#1e3050" strokeWidth={1}/>
        <line x1={lx} y1={AY-FH-13} x2={lx} y2={AY-FH-7}  stroke="#1e3050" strokeWidth={1}/>
        <line x1={rx} y1={AY-FH-13} x2={rx} y2={AY-FH-7}  stroke="#1e3050" strokeWidth={1}/>
        <text x={CX} y={AY-FH-12} textAnchor="middle" fill="#2d4a6a" fontSize={compact?7:8} fontFamily="monospace">OLD {OLD}mm</text>
      </>}

      {/* Axle */}
      <line x1={lx-5} y1={AY} x2={rx+5} y2={AY} stroke="#1e3050" strokeWidth={2}/>
      {/* Hub body */}
      <rect x={nx} y={AY-5} width={Math.max(dx-nx,1)} height={10} fill="#0a1620" stroke="#1e3050" strokeWidth={1}/>
      {/* End caps */}
      <rect x={lx-6} y={AY-14} width={6} height={28} fill="#142030" rx={1}/>
      <rect x={rx}   y={AY-14} width={6} height={28} fill="#142030" rx={1}/>
      {/* NDS flange */}
      <rect x={nx-4} y={AY-FH} width={8} height={FH*2} fill={`url(#${gid}b)`} rx={1}/>
      {/* DS flange */}
      <rect x={dx-4} y={AY-FH} width={8} height={FH*2} fill={`url(#${gid}a)`} rx={1}/>

      {/* PCD labels */}
      {!compact && <>
        <text x={nx} y={AY-FH-4} textAnchor="middle" fill="#60a5fa" fontSize={7} fontFamily="monospace">⌀{pcd_nds}</text>
        <text x={dx} y={AY-FH-4} textAnchor="middle" fill="#fbbf24" fontSize={7} fontFamily="monospace">⌀{pcd_ds}</text>
      </>}

      {/* Centre dashed */}
      <line x1={CX} y1={AY-FH} x2={CX} y2={AY+FH+18} stroke="#1e3050" strokeWidth={1} strokeDasharray="3,2"/>

      {/* Dimension labels */}
      <line x1={nx} y1={AY+FH+5} x2={CX} y2={AY+FH+5} stroke="#3b82f6" strokeWidth={1}/>
      <line x1={nx} y1={AY+FH+2} x2={nx} y2={AY+FH+8} stroke="#3b82f6" strokeWidth={1}/>
      <line x1={CX} y1={AY+FH+2} x2={CX} y2={AY+FH+8} stroke="#3b82f6" strokeWidth={1}/>
      <text x={(nx+CX)/2} y={AY+FH+17} textAnchor="middle" fill="#60a5fa" fontSize={compact?8:9} fontFamily="monospace">
        {type==='rear'?'NDS':'L'} {d_nds}mm
      </text>

      <line x1={CX}  y1={AY+FH+5} x2={dx} y2={AY+FH+5} stroke="#f59e0b" strokeWidth={1}/>
      <line x1={dx}  y1={AY+FH+2} x2={dx} y2={AY+FH+8} stroke="#f59e0b" strokeWidth={1}/>
      <text x={(CX+dx)/2} y={AY+FH+17} textAnchor="middle" fill="#fbbf24" fontSize={compact?8:9} fontFamily="monospace">
        {type==='rear'?'DS':'R'} {d_ds}mm
      </text>

      {!compact &&
        <text x={CX} y={H-4} textAnchor="middle" fill="#2d4a6a" fontSize={7} fontFamily="monospace">
          F–F: {(d_ds+d_nds).toFixed(1)}mm
        </text>
      }
    </svg>
  );
}

// ── CUSTOM TOOLTIP ────────────────────────────────────────────────────────────
const ChartTip = ({active,payload,label}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:'#0b1826',border:'1px solid #1e3050',padding:'8px 12px',fontFamily:'monospace',fontSize:11}}>
      <p style={{color:'#5a80a0',margin:'0 0 4px',fontSize:10}}>{label}</p>
      {payload.map((p,i) => <p key={i} style={{color:p.fill||'#94a3b8',margin:'2px 0'}}>{p.name}: {p.value}</p>)}
    </div>
  );
};

// ── SLIDER ────────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step=0.1, unit='mm', color='#60a5fa', onChange }) {
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
        <span style={{fontFamily:'monospace',fontSize:10,color:'#5a80a0'}}>{label}</span>
        <span style={{fontFamily:'monospace',fontSize:11,color,fontWeight:'bold'}}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{width:'100%',accentColor:color,cursor:'pointer'}}/>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:'#2d4a6a',marginTop:1}}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ── METRIC CARD ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, color, sub }) {
  return (
    <div style={{background:'#0a1620',border:`1px solid ${color}33`,borderRadius:3,padding:'10px 14px',textAlign:'center'}}>
      <div style={{fontFamily:'monospace',fontSize:8,color:'#2d4a6a',letterSpacing:1,marginBottom:4}}>{label}</div>
      <div style={{fontFamily:'monospace',fontSize:20,color,fontWeight:'300',lineHeight:1}}>{value}</div>
      <div style={{fontFamily:'monospace',fontSize:9,color:'#2d4a6a',marginTop:2}}>{unit}</div>
      {sub && <div style={{fontFamily:'monospace',fontSize:8,color,marginTop:4,opacity:0.7}}>{sub}</div>}
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function HubAnalysis() {
  const [tab,       setTab      ] = useState('geo');
  const [wheelKey,  setWheelKey ] = useState('29"');
  const [presetId,  setPresetId ] = useState('r148');
  const [custom,    setCustom   ] = useState(false);
  const [dDS,       setDDS      ] = useState(24.0);
  const [dNDS,      setDNDS     ] = useState(36.3);
  const [pcdDS,     setPcdDS    ] = useState(57.4);
  const [pcdNDS,    setPcdNDS   ] = useState(57.4);
  const [tDS,       setTDS      ] = useState(100);
  const [nSpokes,   setNSpokes  ] = useState(32);

  const erd = WHEELS_SIZES_LOCAL[wheelKey].erd;

  // Current hub params
  const hubParams = custom
    ? { d_ds: dDS, d_nds: dNDS, pcd_ds: pcdDS, pcd_nds: pcdNDS, OLD: null, type: 'rear', name: 'Custom Hub' }
    : { ...PRESETS.find(p => p.id === presetId) };

  // Live metrics
  const m = useMemo(() => calcWheel({
    d_ds:  hubParams.d_ds,  d_nds: hubParams.d_nds,
    pcd_ds:hubParams.pcd_ds,pcd_nds:hubParams.pcd_nds,
    erd_mm:erd, t_ds:tDS, n_spokes:nSpokes
  }), [hubParams.d_ds,hubParams.d_nds,hubParams.pcd_ds,hubParams.pcd_nds,erd,tDS,nSpokes]);

  // All preset metrics (for comparison charts)
  const allM = PRESETS.map(p => ({
    ...p,
    ...calcWheel({ d_ds:p.d_ds,d_nds:p.d_nds,pcd_ds:p.pcd_ds,pcd_nds:p.pcd_nds,
                   erd_mm:erd,t_ds:tDS,n_spokes:nSpokes }),
    isActive: !custom && p.id === presetId,
  }));
  const customRow = custom ? [{
    id:'custom',short:'CUSTOM',name:'Custom Hub',type:'rear',OLD:null,
    d_ds:dDS,d_nds:dNDS,pcd_ds:pcdDS,pcd_nds:pcdNDS,isActive:true,...m
  }] : [];
  const chartData = [...allM, ...customRow];

  const rc = rCol(m.ratio_pct, hubParams.type);

  // Styles
  const BG   = '#060d18';
  const CARD = '#0b1826';
  const BDR  = '#1e3050';
  const GRN  = '#2d9b5a';

  const tabBtn = (id, label) => (
    <button key={id} onClick={()=>setTab(id)} style={{
      background:'none',border:'none',cursor:'pointer',padding:'10px 16px',
      fontFamily:'monospace',fontSize:9,letterSpacing:1.5,textTransform:'uppercase',
      color: tab===id ? '#60a5fa' : '#2d4a6a',
      borderBottom: tab===id ? '2px solid #3b82f6' : '2px solid transparent',
    }}>{label}</button>
  );

  return (
    <div style={{background:BG,minHeight:'100vh',fontFamily:'monospace',color:'#e2e8f0',fontSize:12}}>

      {/* HEADER */}
      <div style={{background:'linear-gradient(180deg,#0b1e36,#060d18)',borderBottom:`1px solid ${BDR}`,padding:'18px 24px 14px'}}>
        <div style={{fontSize:9,color:'#3b82f6',letterSpacing:4,textTransform:'uppercase',marginBottom:4}}>
          Chris King MTB Hubs · Wheel Engineering Analysis · Mode Matrix Model (Ford 2018)
        </div>
        <h1 style={{fontSize:20,fontWeight:300,margin:'0 0 4px',letterSpacing:2,color:'#f1f5f9'}}>
          HUB STANDARDS &amp; WHEEL STRENGTH
        </h1>
        <p style={{margin:0,color:'#2d4a6a',fontSize:10}}>
          Interactive: adjust hub geometry, wheel size, tension &amp; spoke count · Live recalculation
        </p>
      </div>

      {/* CONTROLS PANEL */}
      <div style={{background:'#080f1a',borderBottom:`1px solid ${BDR}`,padding:'14px 24px'}}>
        <div style={{display:'grid',gridTemplateColumns:'auto auto auto 1fr 1fr 1fr',gap:'0 24px',alignItems:'start',flexWrap:'wrap'}}>

          {/* Wheel size */}
          <div>
            <div style={{fontSize:8,color:'#2d4a6a',letterSpacing:2,marginBottom:6}}>WHEEL SIZE</div>
            <div style={{display:'flex',gap:4}}>
              {Object.entries(WHEELS_SIZES_LOCAL).map(([k,v]) => (
                <button key={k} onClick={()=>setWheelKey(k)} style={{
                  background: wheelKey===k ? '#1e3a8a' : '#0a1620',
                  border: `1px solid ${wheelKey===k?'#3b82f6':BDR}`,
                  color: wheelKey===k ? '#60a5fa' : '#2d4a6a',
                  cursor:'pointer',padding:'4px 10px',fontFamily:'monospace',fontSize:9,borderRadius:2,
                }}>{k}</button>
              ))}
            </div>
          </div>

          {/* Spoke count */}
          <div>
            <div style={{fontSize:8,color:'#2d4a6a',letterSpacing:2,marginBottom:6}}>SPOKES</div>
            <div style={{display:'flex',gap:4}}>
              {[28,32,36].map(n => (
                <button key={n} onClick={()=>setNSpokes(n)} style={{
                  background: nSpokes===n ? '#1e3a8a' : '#0a1620',
                  border: `1px solid ${nSpokes===n?'#3b82f6':BDR}`,
                  color: nSpokes===n ? '#60a5fa' : '#2d4a6a',
                  cursor:'pointer',padding:'4px 10px',fontFamily:'monospace',fontSize:9,borderRadius:2,
                }}>{n}H</button>
              ))}
            </div>
          </div>

          {/* Custom toggle */}
          <div>
            <div style={{fontSize:8,color:'#2d4a6a',letterSpacing:2,marginBottom:6}}>MODE</div>
            <div style={{display:'flex',gap:4}}>
              {[['preset','PRESET'],['custom','CUSTOM']].map(([k,l]) => (
                <button key={k} onClick={()=>setCustom(k==='custom')} style={{
                  background: (custom?(k==='custom'):(k==='preset')) ? '#1e3a8a' : '#0a1620',
                  border: `1px solid ${(custom?(k==='custom'):(k==='preset'))?'#3b82f6':BDR}`,
                  color: (custom?(k==='custom'):(k==='preset')) ? '#60a5fa' : '#2d4a6a',
                  cursor:'pointer',padding:'4px 10px',fontFamily:'monospace',fontSize:9,borderRadius:2,
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* DS tension */}
          <div>
            <Slider label="DS Reference Tension" value={tDS} min={60} max={130} step={1} unit=" kgf" color="#fbbf24" onChange={setTDS}/>
          </div>

          {/* Preset selector or d_DS */}
          <div>
            {!custom ? (
              <>
                <div style={{fontSize:8,color:'#2d4a6a',letterSpacing:2,marginBottom:6}}>HUB PRESET</div>
                <select value={presetId} onChange={e=>setPresetId(e.target.value)} style={{
                  background:'#0a1620',border:`1px solid ${BDR}`,color:'#60a5fa',
                  fontFamily:'monospace',fontSize:9,padding:'5px 8px',width:'100%',cursor:'pointer',
                }}>
                  {PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </>
            ) : (
              <>
                <Slider label="Center-to-DS/Right Flange (d_DS)" value={dDS} min={5} max={65} color="#fbbf24" onChange={v=>{setDDS(v);setCustom(true);}}/>
                <Slider label="DS Flange PCD"  value={pcdDS} min={30} max={100} color="#fbbf24" onChange={setPcdDS}/>
              </>
            )}
          </div>

          {/* d_NDS */}
          {custom && (
            <div>
              <Slider label="Center-to-NDS/Left Flange (d_NDS)" value={dNDS} min={5} max={65} color="#60a5fa" onChange={v=>{setDNDS(v);setCustom(true);}}/>
              <Slider label="NDS Flange PCD" value={pcdNDS} min={30} max={100} color="#60a5fa" onChange={setPcdNDS}/>
            </div>
          )}
        </div>
      </div>

      {/* TABS */}
      <div style={{display:'flex',borderBottom:`1px solid ${BDR}`,background:'#080f1a'}}>
        {tabBtn('geo',      '01  Geometry')}
        {tabBtn('tension',  '02  Tension')}
        {tabBtn('strength', '03  Strength')}
        {tabBtn('table',    '04  Data')}
      </div>

      <div style={{maxWidth:1280,margin:'0 auto',padding:'20px 24px 48px'}}>

        {/* ── TAB 1: GEOMETRY ───────────────────────────────────────────── */}
        {tab==='geo' && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>

              {/* LIVE cross-section */}
              <div style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:3,padding:16}}>
                <div style={{fontSize:9,color:'#3b82f6',letterSpacing:2,marginBottom:8}}>ACTIVE HUB — LIVE GEOMETRY</div>
                <div style={{fontFamily:'monospace',fontSize:11,color:'#5a80a0',marginBottom:12}}>{hubParams.name}</div>
                <CrossSection d_ds={hubParams.d_ds} d_nds={hubParams.d_nds}
                  pcd_ds={hubParams.pcd_ds} pcd_nds={hubParams.pcd_nds}
                  OLD={hubParams.OLD} type={hubParams.type} width={380}/>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:14}}>
                  <MetricCard label="NDS/DS RATIO" value={m.ratio_pct} unit="%" color={rc}/>
                  <MetricCard label="FLANGE SPAN" value={m.ftf} unit="mm" color="#38bdf8"/>
                  <MetricCard label="NDS TENSION" value={m.t_nds} unit="kgf" color="#a78bfa"/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginTop:8}}>
                  <MetricCard label="β DS BRACING" value={m.beta_ds} unit="deg" color="#fbbf24"/>
                  <MetricCard label="β NDS BRACING" value={m.beta_nds} unit="deg" color="#60a5fa"/>
                </div>
              </div>

              {/* Legend + explanation */}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:3,padding:14}}>
                  <div style={{fontSize:9,color:GRN,letterSpacing:2,marginBottom:8}}>HOW TO READ THE DIAGRAM</div>
                  <div style={{fontSize:10,color:'#2d4a6a',lineHeight:1.8}}>
                    <div style={{display:'flex',gap:8,marginBottom:4}}><div style={{width:10,height:10,background:'#3b82f6',borderRadius:1,flexShrink:0,marginTop:1}}/><span>Blue flange = NDS / Left (disc side for front)</span></div>
                    <div style={{display:'flex',gap:8,marginBottom:4}}><div style={{width:10,height:10,background:'#f59e0b',borderRadius:1,flexShrink:0,marginTop:1}}/><span>Amber flange = DS / Right (cassette / non-disc)</span></div>
                    <div style={{display:'flex',gap:8,marginBottom:4}}><div style={{width:10,height:10,background:'#1e3050',borderRadius:1,flexShrink:0,marginTop:1}}/><span>Faint diagonal lines = spoke paths to rim (exaggerated laterally)</span></div>
                    <div style={{display:'flex',gap:8,marginBottom:4}}><div style={{width:10,height:10,background:'#1e3050',borderRadius:1,flexShrink:0,marginTop:1}}/><span>F–F = flange-to-flange distance = d_DS + d_NDS</span></div>
                    <p style={{margin:'8px 0 0',fontSize:9,color:'#1e3050'}}>The tension ratio NDS/DS is determined by the ratio of lateral bracing angles. Wider flange spacing = steeper angles = better lateral stiffness and strength.</p>
                  </div>
                </div>
                <div style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:3,padding:14}}>
                  <div style={{fontSize:9,color:'#2d4a6a',letterSpacing:2,marginBottom:8}}>TENSION BALANCE</div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:9,color:'#2d4a6a'}}>NDS/DS ratio</span>
                    <span style={{fontSize:12,color:rc,fontWeight:'bold'}}>{m.ratio_pct}%</span>
                  </div>
                  <div style={{background:'#060d18',height:12,borderRadius:2,position:'relative',marginBottom:4}}>
                    <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(m.ratio_pct,100)}%`,background:rc,borderRadius:2,transition:'width 0.2s'}}/>
                    <div style={{position:'absolute',left:'80%',top:0,bottom:0,width:1,background:'#2d4a6a'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:'#1e3050'}}>
                    <span>50%</span><span>|target 80%</span><span>100%</span>
                  </div>
                </div>
                {/* Wheel size info */}
                <div style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:3,padding:14}}>
                  <div style={{fontSize:9,color:'#2d4a6a',letterSpacing:2,marginBottom:8}}>WHEEL + SPOKE PARAMETERS</div>
                  <div style={{fontSize:10,color:'#2d4a6a',lineHeight:1.8}}>
                    <div>Wheel:  <span style={{color:'#60a5fa'}}>{WHEELS_SIZES_LOCAL[wheelKey].label}</span> · ERD {erd}mm</div>
                    <div>Spokes: <span style={{color:'#60a5fa'}}>{nSpokes} × 3-cross × 2.0mm steel</span></div>
                    <div>DS ref: <span style={{color:'#fbbf24'}}>{tDS} kgf</span> · NDS: <span style={{color:'#a78bfa'}}>{m.t_nds} kgf</span></div>
                    <div>Spoke L: DS <span style={{color:'#fbbf24'}}>{m.L_ds_mm}mm</span> · NDS <span style={{color:'#60a5fa'}}>{m.L_nds_mm}mm</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* All preset cross-sections */}
            <div style={{fontSize:8,color:'#2d4a6a',letterSpacing:2,marginBottom:8}}>ALL CHRIS KING MTB PRESETS — drawn to same scale</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:8}}>
              {PRESETS.filter(p=>p.type==='rear').map(p => {
                const pm = allM.find(x=>x.id===p.id);
                const prc = rCol(pm.ratio_pct,p.type);
                return (
                  <div key={p.id} onClick={()=>{setPresetId(p.id);setCustom(false);}}
                    style={{background:CARD,border:`1px solid ${presetId===p.id&&!custom?'#3b82f6':BDR}`,borderRadius:3,padding:'8px 4px',cursor:'pointer'}}>
                    <div style={{fontFamily:'monospace',fontSize:8,color:presetId===p.id&&!custom?'#60a5fa':'#3d5a80',textAlign:'center',marginBottom:3,textTransform:'uppercase'}}>{p.short}</div>
                    <CrossSection {...p} width={220} compact/>
                    <div style={{padding:'3px 8px',display:'flex',justifyContent:'space-between'}}>
                      <span style={{fontSize:8,color:'#2d4a6a'}}>NDS/DS</span>
                      <span style={{fontSize:9,color:prc,fontWeight:'bold'}}>{pm.ratio_pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {PRESETS.filter(p=>p.type==='front').map(p => {
                const pm = allM.find(x=>x.id===p.id);
                const prc = rCol(pm.ratio_pct,p.type);
                return (
                  <div key={p.id} onClick={()=>{setPresetId(p.id);setCustom(false);}}
                    style={{background:CARD,border:`1px solid ${presetId===p.id&&!custom?'#3b82f6':BDR}`,borderRadius:3,padding:'8px 4px',cursor:'pointer'}}>
                    <div style={{fontFamily:'monospace',fontSize:8,color:presetId===p.id&&!custom?'#60a5fa':'#3d5a80',textAlign:'center',marginBottom:3,textTransform:'uppercase'}}>{p.short}</div>
                    <CrossSection {...p} width={220} compact/>
                    <div style={{padding:'3px 8px',display:'flex',justifyContent:'space-between'}}>
                      <span style={{fontSize:8,color:'#2d4a6a'}}>L/R</span>
                      <span style={{fontSize:9,color:prc,fontWeight:'bold'}}>{pm.ratio_pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 2: TENSION ────────────────────────────────────────────── */}
        {tab==='tension' && (
          <div>
            <div style={{marginBottom:16,borderLeft:'3px solid #1e3a8a',paddingLeft:12}}>
              <div style={{fontSize:16,color:'#e2e8f0',letterSpacing:2,fontWeight:300}}>SPOKE TENSION SYMMETRY</div>
              <div style={{fontSize:9,color:'#2d4a6a',marginTop:2}}>NDS/DS % for rear · L/R % for front · 100% = perfect balance · Target ≥80% for rear</div>
            </div>

            <div style={{display:'flex',height:8,borderRadius:2,overflow:'hidden',marginBottom:4,border:`1px solid ${BDR}`}}>
              {['#ef4444','#f97316','#eab308','#84cc16','#22c55e'].map(c=><div key={c} style={{flex:1,background:c}}/>)}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:'#2d4a6a',marginBottom:16}}>
              <span>50%</span><span>60%</span><span>70%</span><span>80% target</span><span>90%</span><span>100% ideal</span>
            </div>

            <div style={{background:CARD,border:`1px solid ${BDR}`,padding:'16px 20px',borderRadius:3,marginBottom:16}}>
              {chartData.map(h => {
                const rc2 = rCol(h.ratio_pct,h.type);
                const isAct = h.isActive;
                return (
                  <div key={h.id} style={{marginBottom:12,opacity:isAct?1:0.65}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontSize:10,color:isAct?'#94a3b8':'#4a6a8a',width:210,flexShrink:0,fontWeight:isAct?'bold':'normal'}}>
                        {isAct?'▶ ':''}{h.short || h.name}
                      </span>
                      <span style={{fontSize:9,color:'#2d4a6a',flex:1}}>
                        {h.type==='rear'?`NDS = ${h.t_nds}kgf / DS = ${tDS}kgf`:`Disc L = ${h.t_nds}kgf / Non-disc R = ${tDS}kgf`}
                      </span>
                      <span style={{fontSize:11,color:rc2,fontWeight:'bold',width:50,textAlign:'right'}}>{h.ratio_pct}%</span>
                    </div>
                    <div style={{background:'#060d18',height:isAct?14:10,borderRadius:1,position:'relative',border:`1px solid ${isAct?'#1e3a8a':BDR}`}}>
                      <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(h.ratio_pct,100)}%`,background:rc2,borderRadius:1,opacity:0.85,transition:'width 0.3s'}}/>
                      <div style={{position:'absolute',left:'80%',top:0,bottom:0,width:1,background:'#1e3050'}}/>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{background:CARD,border:`1px solid ${BDR}`,padding:'12px 16px',borderRadius:3}}>
                <div style={{fontSize:9,color:'#3b82f6',letterSpacing:1.5,marginBottom:6}}>WHY IT MATTERS</div>
                <p style={{fontSize:10,color:'#2d4a6a',margin:0,lineHeight:1.8}}>
                  Wheel strength scales with <strong style={{color:'#94a3b8'}}>NDS tension</strong>, not DS.
                  The NDS bottom spoke buckles first. ISO 135/142 at {allM[0]?.ratio_pct}% balance means
                  NDS = {allM[0]?.t_nds} kgf. The Superboost 157 at {allM[2]?.ratio_pct}% achieves
                  NDS = {allM[2]?.t_nds} kgf at the same DS reference — a significant strength gain.
                </p>
              </div>
              <div style={{background:CARD,border:`1px solid ${BDR}`,padding:'12px 16px',borderRadius:3}}>
                <div style={{fontSize:9,color:'#f59e0b',letterSpacing:1.5,marginBottom:6}}>THE GEOMETRY</div>
                <p style={{fontSize:10,color:'#2d4a6a',margin:0,lineHeight:1.8}}>
                  Equilibrium: <em style={{color:'#94a3b8'}}>T_DS × sin(β_DS) = T_NDS × sin(β_NDS)</em>.
                  Wider hubs push both flanges further from centre, increasing bracing angles.
                  The current hub has β_DS = {m.beta_ds}° and β_NDS = {m.beta_nds}°.
                  Chris King uses 57.4mm PCD on both flanges — balance is purely from flange position.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: STRENGTH ───────────────────────────────────────────── */}
        {tab==='strength' && (
          <div>
            <div style={{marginBottom:16,borderLeft:'3px solid #1e3a8a',paddingLeft:12}}>
              <div style={{fontSize:16,color:'#e2e8f0',letterSpacing:2,fontWeight:300}}>WHEEL STRENGTH</div>
              <div style={{fontSize:9,color:'#2d4a6a',marginTop:2}}>Mode Matrix (Ford et al. 2016) · Failure = bottom spoke reaches 0 kgf · Static rear load ~35–40 kgf for 75 kg rider</div>
            </div>

            {/* Active hub metrics */}
            <div style={{background:CARD,border:`1px solid ${BDR}`,padding:'14px 18px',borderRadius:3,marginBottom:16}}>
              <div style={{fontSize:9,color:GRN,letterSpacing:2,marginBottom:10}}>ACTIVE HUB: {hubParams.name}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                <MetricCard label="LATERAL STRENGTH" value={m.F_lat_kgf} unit="kgf"  color="#f59e0b" sub="F_lat — sideways"/>
                <MetricCard label="RADIAL STRENGTH"  value={m.F_rad_kgf} unit="kgf"  color="#a78bfa" sub="F_rad — Ford primary"/>
                <MetricCard label="LATERAL STIFFNESS" value={m.K_lat}    unit="N/mm" color="#38bdf8"/>
                <MetricCard label="RADIAL STIFFNESS"  value={m.K_rad}    unit="N/mm" color="#4ade80"/>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              {/* F_rad chart */}
              <div style={{background:CARD,border:`1px solid ${BDR}`,padding:14,borderRadius:3}}>
                <div style={{fontSize:9,color:'#a78bfa',letterSpacing:2,marginBottom:10}}>F_RAD — RADIAL STRENGTH (kgf) · Primary metric</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{top:4,right:4,bottom:44,left:0}}>
                    <CartesianGrid strokeDasharray="3,3" stroke="#0d1e33"/>
                    <XAxis dataKey="short" tick={{fill:'#2d4a6a',fontSize:8}} angle={-40} textAnchor="end" interval={0}/>
                    <YAxis tick={{fill:'#2d4a6a',fontSize:9}} domain={[0,130]}/>
                    <Tooltip content={<ChartTip/>}/>
                    <ReferenceLine y={38} stroke="#1e3050" strokeDasharray="4,3" label={{value:'Static ~38',fill:'#2d4a6a',fontSize:8,position:'insideTopRight'}}/>
                    <Bar dataKey="F_rad_kgf" name="F_rad (kgf)" radius={[2,2,0,0]}>
                      {chartData.map((d,i)=><Cell key={i} fill={d.isActive?'#a78bfa':gCol(d.F_rad_kgf,110)} opacity={d.isActive?1:0.6}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* F_lat chart */}
              <div style={{background:CARD,border:`1px solid ${BDR}`,padding:14,borderRadius:3}}>
                <div style={{fontSize:9,color:'#f59e0b',letterSpacing:2,marginBottom:10}}>F_LAT — LATERAL STRENGTH (kgf)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{top:4,right:4,bottom:44,left:0}}>
                    <CartesianGrid strokeDasharray="3,3" stroke="#0d1e33"/>
                    <XAxis dataKey="short" tick={{fill:'#2d4a6a',fontSize:8}} angle={-40} textAnchor="end" interval={0}/>
                    <YAxis tick={{fill:'#2d4a6a',fontSize:9}} domain={[0,65]}/>
                    <Tooltip content={<ChartTip/>}/>
                    <ReferenceLine y={15} stroke="#1e3050" strokeDasharray="4,3" label={{value:'Cornering ~15',fill:'#2d4a6a',fontSize:8,position:'insideTopRight'}}/>
                    <Bar dataKey="F_lat_kgf" name="F_lat (kgf)" radius={[2,2,0,0]}>
                      {chartData.map((d,i)=><Cell key={i} fill={d.isActive?'#f59e0b':gCol(d.F_lat_kgf,55)} opacity={d.isActive?1:0.6}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* K_lat chart */}
            <div style={{background:CARD,border:`1px solid ${BDR}`,padding:14,borderRadius:3,marginBottom:12}}>
              <div style={{fontSize:9,color:'#38bdf8',letterSpacing:2,marginBottom:10}}>K_LAT — LATERAL STIFFNESS (N/mm)</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={chartData} margin={{top:4,right:4,bottom:4,left:0}}>
                  <CartesianGrid strokeDasharray="3,3" stroke="#0d1e33"/>
                  <XAxis dataKey="short" tick={{fill:'#2d4a6a',fontSize:9}}/>
                  <YAxis tick={{fill:'#2d4a6a',fontSize:9}} domain={[0,140]}/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="K_lat" name="K_lat (N/mm)" radius={[2,2,0,0]}>
                    {chartData.map((d,i)=><Cell key={i} fill={d.isActive?'#38bdf8':'#38bdf8'} opacity={d.isActive?1:0.5}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {[
                ['#ef4444','RADIAL = BINDING LIMIT','F_rad is 1.8–3x lower than F_lat for all rear hubs. Radial impacts (potholes, hard landings) will buckle a spoke before a lateral hit of the same force.'],
                ['#22c55e','AXLE WIDTH IS THE LEVER','Going ISO 142 → Superboost 157 adds +18% to radial strength purely from improved tension balance. Wider = both flanges further out = better bracing.'],
                ['#3b82f6','DS TENSION MATTERS','Use the DS Tension slider above. At 120 kgf (CK max spec), multiply these results by 1.2. All strength values scale linearly with reference tension.'],
              ].map(([c,h,b])=>(
                <div key={h} style={{background:CARD,border:`1px solid ${BDR}`,padding:'10px 12px',borderRadius:3}}>
                  <div style={{fontSize:9,color:c,letterSpacing:1.5,marginBottom:5}}>{h}</div>
                  <p style={{fontSize:10,color:'#2d4a6a',margin:0,lineHeight:1.7}}>{b}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 4: DATA TABLE ─────────────────────────────────────────── */}
        {tab==='table' && (
          <div>
            <div style={{marginBottom:16,borderLeft:'3px solid #1e3a8a',paddingLeft:12}}>
              <div style={{fontSize:16,color:'#e2e8f0',letterSpacing:2,fontWeight:300}}>FULL DATA TABLE</div>
              <div style={{fontSize:9,color:'#2d4a6a',marginTop:2}}>
                All values computed live · Wheel: {WHEELS_SIZES_LOCAL[wheelKey].label} · {nSpokes} spokes · DS ref: {tDS} kgf
              </div>
            </div>

            <div style={{overflowX:'auto',marginBottom:20}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${BDR}`}}>
                    {['Hub','Type','OLD','d_DS/R','d_NDS/L','PCD','Ratio %','β_DS°','β_NDS°','L_DS mm','L_NDS mm','K_lat','F_lat kgf','F_rad kgf','F–F mm'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:'left',color:'#1e3050',fontSize:8,fontWeight:'normal',letterSpacing:1,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((h,i)=>{
                    const rc2=rCol(h.ratio_pct,h.type);
                    return(
                      <tr key={h.id} style={{background:h.isActive?'#0d1e33':i%2===0?BG:'#0a1422',borderBottom:`1px solid #0d1826`}}>
                        <td style={{padding:'7px 10px',color:h.isActive?'#94a3b8':'#3d5a80',fontWeight:h.isActive?'bold':'normal'}}>{h.name}</td>
                        <td style={{padding:'7px 10px',color:h.type==='rear'?'#f59e0b':'#3b82f6',fontSize:9,textTransform:'uppercase'}}>{h.type}</td>
                        <td style={{padding:'7px 10px',color:'#2d4a6a'}}>{h.OLD||'—'}</td>
                        <td style={{padding:'7px 10px',color:'#fbbf24'}}>{h.d_ds}</td>
                        <td style={{padding:'7px 10px',color:'#60a5fa'}}>{h.d_nds}</td>
                        <td style={{padding:'7px 10px',color:GRN}}>{h.pcd_ds}{h.pcd_ds!==h.pcd_nds?`/\n${h.pcd_nds}`:''}</td>
                        <td style={{padding:'7px 10px',color:rc2,fontWeight:'bold'}}>{h.ratio_pct}%</td>
                        <td style={{padding:'7px 10px',color:'#fbbf24'}}>{h.beta_ds}</td>
                        <td style={{padding:'7px 10px',color:'#60a5fa'}}>{h.beta_nds}</td>
                        <td style={{padding:'7px 10px',color:'#2d4a6a'}}>{h.L_ds_mm}</td>
                        <td style={{padding:'7px 10px',color:'#2d4a6a'}}>{h.L_nds_mm}</td>
                        <td style={{padding:'7px 10px',color:'#38bdf8'}}>{h.K_lat}</td>
                        <td style={{padding:'7px 10px',color:'#f59e0b'}}>{h.F_lat_kgf}</td>
                        <td style={{padding:'7px 10px',color:'#a78bfa'}}>{h.F_rad_kgf}</td>
                        <td style={{padding:'7px 10px',color:'#2d4a6a'}}>{h.ftf}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{background:CARD,border:`1px solid ${BDR}`,padding:'12px 16px',borderRadius:3}}>
              <div style={{fontSize:9,color:'#1e3050',letterSpacing:2,marginBottom:8}}>COLUMN DEFINITIONS</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 24px',fontSize:9}}>
                {[['d_DS/R','Center plane to DS (rear) or Right (front) flange (mm)'],
                  ['d_NDS/L','Center plane to NDS (rear) or Left (front) flange (mm)'],
                  ['PCD','Pitch circle diameter of spoke holes — 57.4mm on all CK MTB hubs'],
                  ['Ratio %','NDS/DS tension (rear) or L/R (front)'],
                  ['β','Lateral bracing angle = arcsin(d/L) — larger is stiffer'],
                  ['L_DS / L_NDS','Computed 3-cross spoke length each side'],
                  ['K_lat','Lateral wheel stiffness at contact patch (N/mm)'],
                  ['F_lat','Min lateral force for weak-side spoke to reach 0 kgf'],
                  ['F_rad','Min radial force for weak-side spoke to reach 0 kgf — Ford primary'],
                  ['F–F','Flange-to-flange distance = d_DS + d_NDS (mm)'],
                ].map(([k,v])=>(
                  <div key={k} style={{display:'flex',gap:8}}>
                    <span style={{color:'#3b82f6',width:80,flexShrink:0}}>{k}</span>
                    <span style={{color:'#1e3050',lineHeight:1.6}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{marginTop:40,borderTop:`1px solid #0d1826`,paddingTop:12,fontSize:8,color:'#1e3050',lineHeight:2}}>
          Ford (2018) Reinventing the Wheel — Northwestern U. &nbsp;|&nbsp;
          Ford, Papadopoulos &amp; Balogun (2016) Buckling of the Bicycle Wheel &nbsp;|&nbsp;
          Hub dimensions: chrisking.com / velodrop.com (Nov 2024) &nbsp;|&nbsp;
          Rim: DT Swiss TK540 29" EIlat=50 EIrad=150 GJ=40 N·m²
        </div>
      </div>
    </div>
  );
}

// Alias for the constant (avoids naming conflict with a native variable name)
const WHEELS_SIZES_LOCAL = WHEEL_SIZES;
