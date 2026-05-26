import { useState, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 상수 & 기본 플랜
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY    = "nsm_weeks_v3";
const PLAN_STORE_KEY = "nsm_plan_v3";

const DEFAULT_PLAN = [
  { day:"월", type:"quality", label:"퀄리티", icon:"⚡", warmupMin:15, cooldownMin:10, sets:3,  setMin:10, restSec:60, targetPaceMin:"6:20", targetPaceMax:"6:40" },
  { day:"화", type:"easy",    label:"이지런", icon:"🌿", totalMin:40,  targetPaceMin:"7:30", targetPaceMax:"8:30" },
  { day:"수", type:"quality", label:"퀄리티", icon:"⚡", warmupMin:15, cooldownMin:10, sets:5,  setMin:6,  restSec:60, targetPaceMin:"6:05", targetPaceMax:"6:20" },
  { day:"목", type:"easy",    label:"이지런", icon:"🌿", totalMin:40,  targetPaceMin:"7:30", targetPaceMax:"8:30" },
  { day:"금", type:"quality", label:"퀄리티", icon:"⚡", warmupMin:15, cooldownMin:10, sets:8,  setMin:3,  restSec:60, targetPaceMin:"5:50", targetPaceMax:"6:05" },
  { day:"토", type:"long",    label:"롱런",   icon:"🏃", totalMin:70,  targetPaceMin:"8:00", targetPaceMax:"8:30" },
  { day:"일", type:"rest",    label:"휴식",   icon:"😴", totalMin:0,   targetPaceMin:"—",   targetPaceMax:"" },
];
const DAYS_KO     = ["월","화","수","목","금","토","일"];
const TYPE_COLOR  = { quality:"#E8572A", easy:"#3DBFA0", long:"#5BA4CF", rest:"#444" };
const TYPE_LABELS = { quality:"퀄리티", easy:"이지런", long:"롱런", rest:"휴식" };
const TYPE_ICONS  = { quality:"⚡", easy:"🌿", long:"🏃", rest:"😴" };
const CONDITION_LIST = [
  {val:5,label:"최상",emoji:"🔥"},{val:4,label:"좋음",emoji:"😊"},
  {val:3,label:"보통",emoji:"😐"},{val:2,label:"피곤",emoji:"😓"},{val:1,label:"힘듦",emoji:"😩"},
];

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────
function getMondayOf(date){
  const d=new Date(date); const dow=d.getDay();
  d.setDate(d.getDate()-(dow===0?6:dow-1)); d.setHours(0,0,0,0); return d;
}
function dateToKey(d){ return d.toISOString().slice(0,10); }
function getWeekKey(offset=0){
  const mon=getMondayOf(new Date()); mon.setDate(mon.getDate()+offset*7); return dateToKey(mon);
}
function weekDates(mondayKey){
  const [y,m,dd]=mondayKey.split("-").map(Number), mon=new Date(y,m-1,dd);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(d.getDate()+i); return d; });
}
function loadJSON(key,fallback){
  try{ return JSON.parse(localStorage.getItem(key)||"null")??fallback; }catch{ return fallback; }
}
function saveJSON(key,val){ try{ localStorage.setItem(key,JSON.stringify(val)); }catch{} }
function getConditionInfo(val){ return CONDITION_LIST.find(c=>c.val===val)||CONDITION_LIST[2]; }
function planTotalMin(p){
  if(p.type==="rest") return 0;
  if(p.type==="easy"||p.type==="long") return Number(p.totalMin)||0;
  const w=Number(p.warmupMin)||0,c=Number(p.cooldownMin)||0;
  const s=Number(p.sets)||0,m=Number(p.setMin)||0,r=Number(p.restSec)||0;
  return w+c+s*m+Math.max(0,s-1)*Math.ceil(r/60);
}
function targetPaceStr(p){
  if(!p.targetPaceMin||p.targetPaceMin==="—") return "—";
  if(!p.targetPaceMax) return p.targetPaceMin;
  return `${p.targetPaceMin}~${p.targetPaceMax}`;
}
function fullPlanSummary(p){
  if(p.type==="rest") return "완전 휴식";
  if(p.type==="easy") return `편안한 조깅 ${p.totalMin||40}분`;
  if(p.type==="long") return `장거리 이지런 ${p.totalMin||70}분`;
  return `워밍업 ${p.warmupMin||15}분 + ${p.setMin||10}분×${p.sets||3}세트 (휴식 ${p.restSec||60}초) + 쿨다운 ${p.cooldownMin||10}분`;
}
function paceToSec(s){ if(!s) return null; const p=s.split(":").map(Number); return p.length===2?p[0]*60+(p[1]||0):null; }
function paceInRange(pace,pMin,pMax){
  const s=paceToSec(pace),lo=paceToSec(pMin),hi=paceToSec(pMax);
  if(s===null||lo===null||hi===null) return null;
  return s>=lo&&s<=hi;
}

// ─── 공통 스타일 상수 ─────────────────────────────────────────────────────────
const S = {
  // 폰트
  xs:   12,   // 레이블, 보조 정보
  sm:   14,   // 보조 텍스트
  md:   16,   // 본문
  lg:   18,   // 중간 강조
  xl:   22,   // 큰 숫자, 제목
  xxl:  28,   // 헤더 제목
};
const nbtn={
  background:"none",border:"1px solid #2a2a2a",color:"#888",
  width:40,height:40,borderRadius:8,cursor:"pointer",
  fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",padding:0,
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPARISON ROW
// ─────────────────────────────────────────────────────────────────────────────
function CompareRow({ plan:p, rec }){
  const done = rec?.done && !rec?.skipped;
  const skipped = rec?.skipped;
  const inRange = done&&rec.pace ? paceInRange(rec.pace,p.targetPaceMin,p.targetPaceMax) : null;
  const paceColor = inRange===true?"#3DBFA0":inRange===false?"#E8572A":"#888";
  const planMin = planTotalMin(p);
  const recMin  = rec?.duration||null;
  const durDiff = (done&&recMin&&planMin) ? recMin-planMin : null;
  if(p.type==="rest") return null;

  return(
    <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #1e1e1e"}}>
      <div style={{display:"flex",marginBottom:8,gap:4}}>
        <div style={{flex:1,fontSize:S.xs,letterSpacing:2,color:"#555",textAlign:"center"}}>계획</div>
        <div style={{width:1,background:"#1e1e1e"}}/>
        <div style={{flex:1,fontSize:S.xs,letterSpacing:2,color:done?"#aaa":skipped?"#555":"#444",textAlign:"center"}}>
          {skipped?"⏭ 건너뜀":done?"실제":"미기록"}
        </div>
      </div>
      <CmpItem label="페이스" planVal={targetPaceStr(p)==="—"?null:`${targetPaceStr(p)}/km`}
        recVal={done&&rec.pace?`${rec.pace}/km`:null} recColor={paceColor}
        suffix={inRange===true?" ✓":inRange===false?" ▲":""} skipped={skipped}/>
      <CmpItem label="시간" planVal={planMin?`${planMin}분`:null}
        recVal={done&&recMin?`${recMin}분`:null}
        recSuffix={durDiff!==null?(durDiff>0?` +${durDiff}분`:durDiff<0?` ${durDiff}분`:" ="):null}
        recColor={durDiff===null||durDiff===0?"#3DBFA0":durDiff>0?"#5BA4CF":"#E8572A"} skipped={skipped}/>
      {done&&rec.hr&&<CmpItem label="심박수" planVal="—" recVal={`${rec.hr} bpm`} recColor="#CF5B7A" skipped={false}/>}
      {done&&rec.dist&&<CmpItem label="거리" planVal="—" recVal={`${rec.dist} km`} recColor="#5BA4CF" skipped={false}/>}
      {done&&rec.condition&&(
        <CmpItem label="컨디션" planVal="—"
          recVal={`${getConditionInfo(rec.condition).emoji} ${getConditionInfo(rec.condition).label}`}
          recColor="#A07CF5" skipped={false}/>
      )}
      {done&&rec.memo&&(
        <div style={{fontSize:S.sm,color:"#666",fontStyle:"italic",marginTop:8}}>"{rec.memo}"</div>
      )}
    </div>
  );
}
function CmpItem({label,planVal,recVal,recColor,suffix,recSuffix,skipped}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:7}}>
      <div style={{width:44,fontSize:S.xs,color:"#555",flexShrink:0}}>{label}</div>
      <div style={{flex:1,fontSize:S.sm,fontFamily:"monospace",color:"#666",textAlign:"right",paddingRight:10}}>
        {planVal||"—"}
      </div>
      <div style={{width:1,background:"#1e1e1e",alignSelf:"stretch"}}/>
      <div style={{flex:1,fontSize:S.sm,fontFamily:"monospace",color:skipped?"#333":recColor||"#888",textAlign:"left",paddingLeft:10}}>
        {skipped?"—":recVal?`${recVal}${suffix||""}${recSuffix||""}`:
          <span style={{color:"#2a2a2a"}}>—</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEK VIEW
// ─────────────────────────────────────────────────────────────────────────────
function WeekView({ plan, logData, onLogDay, weekKey }){
  const dates=weekDates(weekKey);
  const today=new Date(); today.setHours(0,0,0,0);
  const days=logData?.[weekKey]||{};
  const entries=Object.values(days).filter(d=>d.done&&!d.skipped);
  const totalMin  = entries.reduce((a,d)=>a+(d.duration||0),0);
  const totalDist = entries.reduce((a,d)=>a+(d.dist||0),0);
  const hrArr=entries.filter(d=>d.hr).map(d=>d.hr);
  const avgHr=hrArr.length?Math.round(hrArr.reduce((a,b)=>a+b,0)/hrArr.length):null;

  return(
    <div>
      {entries.length>0&&(
        <div style={{display:"flex",background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:10,padding:"14px 0",marginBottom:16}}>
          {[
            {label:"완료",    val:`${entries.length}회`,                     color:"#3DBFA0"},
            {label:"총시간",  val:totalMin?`${totalMin}분`:"—",              color:"#5BA4CF"},
            {label:"총거리",  val:totalDist?`${totalDist.toFixed(1)}km`:"—", color:"#E8572A"},
            {label:"평균심박",val:avgHr?`${avgHr}bpm`:"—",                   color:"#CF5B7A"},
          ].map((s,i,arr)=>(
            <div key={i} style={{flex:1,textAlign:"center",borderRight:i<arr.length-1?"1px solid #1e1e1e":"none"}}>
              <div style={{fontSize:S.xl,fontWeight:700,color:s.color,fontFamily:"monospace"}}>{s.val}</div>
              <div style={{fontSize:S.xs,color:"#555",letterSpacing:1,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {plan.map((p,i)=>{
        const date=dates[i];
        const isToday=date&&date.getTime()===today.getTime();
        const rec=days[i]||{};
        const done=rec.done;
        const tc=TYPE_COLOR[p.type];
        return(
          <div key={i}
            onClick={()=>p.type!=="rest"&&onLogDay(i,weekKey)}
            style={{
              background:"#111",
              border:`1px solid ${isToday&&!done?tc:"#1E1E1E"}`,
              borderLeft:`4px solid ${done&&!rec.skipped?"#2a2a2a":tc}`,
              borderRadius:10,padding:"16px",marginBottom:10,
              cursor:p.type==="rest"?"default":"pointer",
            }}
          >
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              {/* 날짜 뱃지 */}
              <div style={{
                width:48,height:48,borderRadius:"50%",flexShrink:0,
                background:`${tc}18`,border:`1px solid ${done&&!rec.skipped?"#2a2a2a":tc}`,
                display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",
                lineHeight:1.1,
              }}>
                <span style={{fontSize:S.md,fontWeight:700,color:done&&!rec.skipped?"#444":tc}}>{p.day}</span>
                {date&&<span style={{fontSize:S.xs,color:done&&!rec.skipped?"#333":tc,opacity:.8}}>{date.getDate()}</span>}
              </div>

              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                  <span style={{fontSize:S.lg,fontWeight:700,color:done&&!rec.skipped?"#555":"#E8E8E8"}}>
                    {p.icon} {p.label}
                  </span>
                  <span style={{fontSize:S.xs,letterSpacing:1,padding:"3px 7px",borderRadius:4,background:`${tc}20`,color:done&&!rec.skipped?"#444":tc}}>
                    {p.type.toUpperCase()}
                  </span>
                  {isToday&&!done&&(
                    <span style={{fontSize:S.xs,color:"#E8572A",border:"1px solid #E8572A",padding:"2px 7px",borderRadius:4,letterSpacing:1}}>TODAY</span>
                  )}
                </div>
                <div style={{fontSize:S.sm,color:"#666"}}>{fullPlanSummary(p)}</div>
                {p.type!=="rest"&&(
                  <div style={{fontSize:S.sm,color:"#555",marginTop:3}}>목표 {targetPaceStr(p)}/km · {planTotalMin(p)}분</div>
                )}
              </div>

              <div style={{flexShrink:0}}>
                {done&&!rec.skipped
                  ?<span style={{fontSize:24}}>✅</span>
                  :rec.skipped
                    ?<span style={{fontSize:24}}>⏭</span>
                    :p.type!=="rest"
                      ?<span style={{fontSize:S.sm,color:tc,border:`1px solid ${tc}`,padding:"6px 12px",borderRadius:6,letterSpacing:1,whiteSpace:"nowrap"}}>기록</span>
                      :null
                }
              </div>
            </div>
            <CompareRow plan={p} rec={rec}/>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR VIEW
// ─────────────────────────────────────────────────────────────────────────────
function CalendarView({ plan, logData, onLogDay }){
  const today=new Date(); today.setHours(0,0,0,0);
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const prevMonth=()=>{ if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); };
  const nextMonth=()=>{ if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); };
  const firstDay=new Date(year,month,1);
  const startPad=(firstDay.getDay()+6)%7;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<startPad;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(new Date(year,month,d));

  function getCellInfo(date){
    const dow=(date.getDay()+6)%7;
    const planItem=plan[dow];
    const mon=getMondayOf(date), wk=dateToKey(mon);
    const rec=logData?.[wk]?.[dow]||null;
    return{dow,planItem,wk,rec,isToday:date.getTime()===today.getTime()};
  }

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <button onClick={prevMonth} style={nbtn}>‹</button>
        <div style={{flex:1,textAlign:"center",fontSize:S.lg,fontWeight:700,color:"#E8E8E8",letterSpacing:1}}>
          {new Date(year,month,1).toLocaleDateString("ko-KR",{year:"numeric",month:"long"})}
        </div>
        <button onClick={nextMonth} style={nbtn}>›</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:6}}>
        {DAYS_KO.map(d=>(
          <div key={d} style={{textAlign:"center",fontSize:S.sm,color:"#555",fontWeight:700,padding:"5px 0"}}>{d}</div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
        {cells.map((date,i)=>{
          if(!date) return <div key={`pad-${i}`}/>;
          const{dow,planItem,wk,rec,isToday}=getCellInfo(date);
          const tc=TYPE_COLOR[planItem.type];
          const done=rec?.done&&!rec?.skipped;
          const skipped=rec?.skipped;
          const inRange=done&&rec.pace?paceInRange(rec.pace,planItem.targetPaceMin,planItem.targetPaceMax):null;
          return(
            <div key={i}
              onClick={()=>planItem.type!=="rest"&&onLogDay(dow,wk)}
              style={{
                background:done?`${tc}20`:"#111",
                border:`1px solid ${isToday?tc:done?`${tc}55`:"#1e1e1e"}`,
                borderRadius:8,padding:"6px 4px",
                cursor:planItem.type==="rest"?"default":"pointer",
                minHeight:70,display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                position:"relative",
              }}
            >
              <div style={{fontSize:S.sm,fontWeight:700,color:isToday?tc:done?tc:"#666",lineHeight:1}}>{date.getDate()}</div>
              <div style={{width:6,height:6,borderRadius:"50%",background:done?tc:skipped?"#333":planItem.type==="rest"?"#222":`${tc}55`}}/>
              {planItem.type!=="rest"&&<div style={{fontSize:18,lineHeight:1}}>{planItem.icon}</div>}
              {done&&rec.pace&&(
                <div style={{
                  fontSize:11,color:inRange===false?"#E8572A":tc,
                  fontFamily:"monospace",background:`${tc}18`,
                  borderRadius:3,padding:"2px 4px",lineHeight:1.3,
                  textAlign:"center",maxWidth:"100%",overflow:"hidden",
                }}>
                  {rec.pace}
                </div>
              )}
              {skipped&&<div style={{fontSize:S.xs,color:"#555"}}>⏭</div>}
              {isToday&&(
                <div style={{position:"absolute",inset:-1,borderRadius:8,border:`2px solid ${tc}`,pointerEvents:"none"}}/>
              )}
            </div>
          );
        })}
      </div>

      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:16,paddingTop:14,borderTop:"1px solid #1e1e1e"}}>
        {Object.entries(TYPE_COLOR).map(([type,color])=>(
          <div key={type} style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:color}}/>
            <span style={{fontSize:S.sm,color:"#666"}}>{TYPE_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOG MODAL
// ─────────────────────────────────────────────────────────────────────────────
function LogModal({planItem:p,dayIdx,weekKey,logData,onSave,onClose}){
  const existing=logData?.[weekKey]?.[dayIdx]||{};
  const [pace,setPace]=useState(existing.pace||"");
  const [hr,setHr]=useState(existing.hr||"");
  const [dist,setDist]=useState(existing.dist||"");
  const [duration,setDur]=useState(existing.duration||planTotalMin(p)||"");
  const [condition,setCond]=useState(existing.condition||3);
  const [memo,setMemo]=useState(existing.memo||"");
  const [skipped,setSkipped]=useState(existing.skipped||false);
  const tc=TYPE_COLOR[p.type];
  const [y,m,dd]=weekKey.split("-").map(Number);
  const dateLabel=new Date(y,m-1,dd+dayIdx).toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"});
  const handleSave=()=>{
    onSave(dayIdx,weekKey,{done:true,skipped,pace:pace||null,hr:hr?Number(hr):null,dist:dist?Number(dist):null,duration:duration?Number(duration):null,condition,memo:memo||null,savedAt:new Date().toISOString()});
    onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#141414",borderRadius:"20px 20px 0 0",border:"1px solid #222",borderBottom:"none",padding:"28px 20px 48px",width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{width:40,height:5,background:"#333",borderRadius:3,margin:"0 auto 24px"}}/>

        {/* 헤더 */}
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:`${tc}20`,border:`1.5px solid ${tc}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{p.icon}</div>
          <div>
            <div style={{fontSize:S.lg,fontWeight:700,color:"#E8E8E8"}}>{p.day}요일 · {p.label}</div>
            <div style={{fontSize:S.sm,color:"#666",marginTop:2}}>{dateLabel}</div>
            <div style={{fontSize:S.sm,color:"#555",marginTop:1}}>{fullPlanSummary(p)}</div>
          </div>
        </div>

        {/* 계획 요약 */}
        {p.type!=="rest"&&(
          <div style={{background:"#0e0e0e",border:"1px solid #1e1e1e",borderRadius:10,padding:"12px 14px",marginBottom:16,display:"flex",gap:20,flexWrap:"wrap"}}>
            <MiniChip label="목표 페이스" val={`${targetPaceStr(p)}/km`} color={tc}/>
            <MiniChip label="목표 시간" val={`${planTotalMin(p)}분`} color={tc}/>
            {p.type==="quality"&&<MiniChip label="세트" val={`${p.setMin||10}분×${p.sets||3}세트`} color={tc}/>}
          </div>
        )}

        {/* 완료/건너뜀 토글 */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,padding:"14px 16px",background:skipped?"#1a0a0a":"#0e0e0e",border:`1px solid ${skipped?"#5a1a1a":"#1e1e1e"}`,borderRadius:10}}>
          <span style={{fontSize:S.md,color:skipped?"#CF5B7A":"#888"}}>{skipped?"⏭ 이번 세션 건너뜀":"세션 완료"}</span>
          <div onClick={()=>setSkipped(s=>!s)} style={{width:50,height:28,borderRadius:14,background:skipped?"#5a1a1a":"#1E8A6E",position:"relative",cursor:"pointer",transition:"background .2s"}}>
            <div style={{position:"absolute",top:4,left:skipped?4:26,width:20,height:20,borderRadius:"50%",background:skipped?"#CF5B7A":"#3DBFA0",transition:"left .2s"}}/>
          </div>
        </div>

        {!skipped&&(
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <Field label="평균 페이스 (분:초/km)" placeholder="예: 6:25" value={pace} onChange={setPace} hint={`목표: ${targetPaceStr(p)}`} color="#E8572A"/>
              <Field label="평균 심박수 (bpm)" placeholder="예: 142" value={hr} onChange={setHr} hint="Samsung Health 확인" color="#CF5B7A" type="number"/>
              <Field label="총 거리 (km)" placeholder="예: 8.5" value={dist} onChange={setDist} color="#5BA4CF" type="number"/>
              <Field label="운동 시간 (분)" placeholder={`예: ${planTotalMin(p)}`} value={duration} onChange={setDur} color="#3DBFA0" type="number"/>
            </div>

            {/* 컨디션 */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:S.sm,color:"#666",letterSpacing:1,marginBottom:10}}>컨디션</div>
              <div style={{display:"flex",gap:6}}>
                {CONDITION_LIST.map(c=>(
                  <button key={c.val} onClick={()=>setCond(c.val)} style={{
                    flex:1,padding:"10px 0",borderRadius:8,cursor:"pointer",
                    background:condition===c.val?"#A07CF525":"#0e0e0e",
                    border:`1px solid ${condition===c.val?"#A07CF5":"#1e1e1e"}`,
                    display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                    transition:"all .15s",
                  }}>
                    <span style={{fontSize:24}}>{c.emoji}</span>
                    <span style={{fontSize:S.xs,color:condition===c.val?"#A07CF5":"#666"}}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 메모 */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:S.sm,color:"#666",letterSpacing:1,marginBottom:8}}>메모</div>
              <textarea value={memo} onChange={e=>setMemo(e.target.value)}
                placeholder="오늘 훈련 소감, 몸 상태, 특이사항..."
                rows={3} style={{
                  width:"100%",background:"#0e0e0e",border:"1px solid #1e1e1e",
                  borderRadius:10,padding:"12px 14px",color:"#ccc",
                  fontSize:S.md,resize:"none",outline:"none",
                  fontFamily:"inherit",boxSizing:"border-box",lineHeight:1.6,
                }}/>
            </div>
          </>
        )}

        <button onClick={handleSave} style={{width:"100%",padding:16,borderRadius:10,border:"none",background:tc,color:"#fff",fontWeight:700,fontSize:S.lg,letterSpacing:2,cursor:"pointer"}}>저장</button>
      </div>
    </div>
  );
}

function MiniChip({label,val,color}){
  return(
    <div>
      <div style={{fontSize:S.xs,color:"#555",letterSpacing:1,marginBottom:3}}>{label}</div>
      <div style={{fontSize:S.md,fontWeight:700,color,fontFamily:"monospace"}}>{val}</div>
    </div>
  );
}

function Field({label,placeholder,value,onChange,hint,color,type="text"}){
  return(
    <div>
      <div style={{fontSize:S.xs,color:"#666",marginBottom:5}}>{label}</div>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{
          width:"100%",background:"#0e0e0e",border:"1px solid #1e1e1e",
          borderRadius:8,padding:"10px 12px",color:"#e0e0e0",
          fontSize:S.md,outline:"none",fontFamily:"monospace",boxSizing:"border-box",
        }}
        onFocus={e=>e.target.style.borderColor=color||"#444"}
        onBlur={e=>e.target.style.borderColor="#1e1e1e"}
      />
      {hint&&<div style={{fontSize:S.xs,color:"#444",marginTop:4}}>{hint}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN EDIT MODAL
// ─────────────────────────────────────────────────────────────────────────────
function PlanEditModal({plan,onSave,onClose}){
  const contentOf=p=>{ const {day,...rest}=p; return {...rest}; };
  const [contents,setContents]=useState(plan.map(p=>contentOf(p)));
  const [editIdx,setEditIdx]=useState(null);
  const dragIdx=useRef(null), dragOverIdx=useRef(null);
  const updateContent=(i,key,val)=>setContents(prev=>prev.map((c,idx)=>idx===i?{...c,[key]:val}:c));
  const handleDragStart=i=>{ dragIdx.current=i; };
  const handleDragOver=(e,i)=>{ e.preventDefault(); dragOverIdx.current=i; };
  const handleDrop=()=>{
    const from=dragIdx.current,to=dragOverIdx.current;
    if(from===null||to===null||from===to){ dragIdx.current=null;dragOverIdx.current=null;return; }
    setContents(prev=>{ const n=[...prev],tmp=n[from]; n[from]=n[to]; n[to]=tmp; return n; });
    dragIdx.current=null; dragOverIdx.current=null;
  };
  const handleSave=()=>{
    const newPlan=contents.map((c,i)=>({...c,day:DAYS_KO[i],label:TYPE_LABELS[c.type],icon:TYPE_ICONS[c.type]}));
    onSave(newPlan); onClose();
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#141414",borderRadius:"20px 20px 0 0",border:"1px solid #222",borderBottom:"none",padding:"20px 16px 48px",width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{width:40,height:5,background:"#333",borderRadius:3,margin:"0 auto 20px"}}/>
        <div style={{fontSize:S.lg,fontWeight:700,color:"#E8E8E8",marginBottom:4}}>주간 플랜 편집</div>
        <div style={{fontSize:S.sm,color:"#666",marginBottom:18}}>드래그로 세션 내용 이동 (요일 고정) · 탭으로 세부 수정</div>

        {contents.map((c,i)=>{
          const tc=TYPE_COLOR[c.type];
          const p={...c,day:DAYS_KO[i]};
          return(
            <div key={i} draggable onDragStart={()=>handleDragStart(i)} onDragOver={e=>handleDragOver(e,i)} onDrop={handleDrop}
              style={{background:editIdx===i?"#1a1a1a":"#111",border:`1px solid ${editIdx===i?tc:"#1e1e1e"}`,borderLeft:`4px solid ${tc}`,borderRadius:10,padding:"14px",marginBottom:8,cursor:"grab",userSelect:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:`${tc}18`,border:`1px solid ${tc}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",lineHeight:1.1,flexShrink:0}}>
                  <span style={{fontSize:S.md,fontWeight:700,color:tc}}>{DAYS_KO[i]}</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:S.md,fontWeight:700,color:"#ddd",marginBottom:3}}>
                    {TYPE_ICONS[c.type]} {TYPE_LABELS[c.type]}
                    <span style={{marginLeft:8,fontSize:S.xs,letterSpacing:1,background:`${tc}20`,color:tc,padding:"2px 6px",borderRadius:4}}>{c.type.toUpperCase()}</span>
                  </div>
                  <div style={{fontSize:S.sm,color:"#666"}}>{fullPlanSummary(p)} · {planTotalMin(p)}분</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                  <button onClick={()=>setEditIdx(editIdx===i?null:i)} style={{background:"none",border:`1px solid ${editIdx===i?tc:"#333"}`,color:editIdx===i?tc:"#777",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:S.sm}}>
                    {editIdx===i?"닫기":"편집"}
                  </button>
                  <span style={{color:"#444",fontSize:20,cursor:"grab"}}>⠿</span>
                </div>
              </div>

              {editIdx===i&&(
                <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #1e1e1e"}}>
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:S.sm,color:"#666",marginBottom:8}}>세션 종류</div>
                    <div style={{display:"flex",gap:6}}>
                      {Object.entries(TYPE_LABELS).map(([t,lbl])=>(
                        <button key={t} onClick={()=>updateContent(i,"type",t)} style={{flex:1,padding:"10px 0",borderRadius:8,cursor:"pointer",background:c.type===t?`${TYPE_COLOR[t]}20`:"#0e0e0e",border:`1px solid ${c.type===t?TYPE_COLOR[t]:"#1e1e1e"}`,color:c.type===t?TYPE_COLOR[t]:"#666",fontSize:S.sm,transition:"all .15s"}}>
                          <div style={{fontSize:22}}>{TYPE_ICONS[t]}</div>
                          <div style={{fontSize:S.xs,marginTop:2}}>{lbl}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {c.type==="quality"&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                      <SmallField label="워밍업 (분)" val={c.warmupMin??15} onChange={v=>updateContent(i,"warmupMin",v)}/>
                      <SmallField label="세트 수" val={c.sets??3} onChange={v=>updateContent(i,"sets",v)}/>
                      <SmallField label="세트당 (분)" val={c.setMin??10} onChange={v=>updateContent(i,"setMin",v)}/>
                      <SmallField label="휴식 (초)" val={c.restSec??60} onChange={v=>updateContent(i,"restSec",v)}/>
                      <SmallField label="쿨다운 (분)" val={c.cooldownMin??10} onChange={v=>updateContent(i,"cooldownMin",v)}/>
                    </div>
                  )}
                  {(c.type==="easy"||c.type==="long")&&(
                    <div style={{marginBottom:14}}>
                      <SmallField label="총 시간 (분)" val={c.totalMin||40} onChange={v=>updateContent(i,"totalMin",v)}/>
                    </div>
                  )}
                  {c.type!=="rest"&&(
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:S.sm,color:"#666",marginBottom:8}}>목표 페이스 (분:초/km)</div>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <SmallField label="최소" val={c.targetPaceMin||""} onChange={v=>updateContent(i,"targetPaceMin",v)} placeholder="6:20"/>
                        <span style={{color:"#555",paddingTop:20,fontSize:S.md}}>~</span>
                        <SmallField label="최대" val={c.targetPaceMax||""} onChange={v=>updateContent(i,"targetPaceMax",v)} placeholder="6:40"/>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div style={{display:"flex",gap:10,marginTop:18}}>
          <button onClick={onClose} style={{flex:1,padding:15,borderRadius:10,border:"1px solid #333",background:"none",color:"#777",fontSize:S.md,cursor:"pointer"}}>취소</button>
          <button onClick={handleSave} style={{flex:2,padding:15,borderRadius:10,border:"none",background:"#E8572A",color:"#fff",fontWeight:700,fontSize:S.md,letterSpacing:1,cursor:"pointer"}}>저장</button>
        </div>
      </div>
    </div>
  );
}

function SmallField({label,val,onChange,placeholder}){
  return(
    <div>
      <div style={{fontSize:S.xs,color:"#666",marginBottom:5}}>{label}</div>
      <input value={val} onChange={e=>onChange(e.target.value)} placeholder={placeholder||""}
        style={{width:"100%",background:"#0e0e0e",border:"1px solid #1e1e1e",borderRadius:8,padding:"10px 12px",color:"#e0e0e0",fontSize:S.md,fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}
        onFocus={e=>e.target.style.borderColor="#E8572A"}
        onBlur={e=>e.target.style.borderColor="#1e1e1e"}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEK NAV
// ─────────────────────────────────────────────────────────────────────────────
function WeekNav({weekOffset,setWeekOffset}){
  const label=weekOffset===0?"이번 주":weekOffset===-1?"지난 주":`${Math.abs(weekOffset)}주 전`;
  const d=new Date(); d.setDate(d.getDate()-d.getDay()+1+weekOffset*7);
  const mon=d.toLocaleDateString("ko-KR",{month:"short",day:"numeric"});
  const sun=new Date(d); sun.setDate(sun.getDate()+6);
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
      <button onClick={()=>setWeekOffset(w=>w-1)} style={nbtn}>‹</button>
      <div style={{flex:1,textAlign:"center"}}>
        <div style={{fontSize:S.lg,fontWeight:700,color:"#F0F0F0"}}>{label}</div>
        <div style={{fontSize:S.sm,color:"#666",marginTop:2}}>{mon} – {sun.toLocaleDateString("ko-KR",{month:"short",day:"numeric"})}</div>
      </div>
      <button onClick={()=>setWeekOffset(w=>Math.min(0,w+1))} style={{...nbtn,opacity:weekOffset>=0?.25:1}} disabled={weekOffset>=0}>›</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App(){
  const [logData,    setLogData]    = useState(()=>loadJSON(STORAGE_KEY,{}));
  const [plan,       setPlan]       = useState(()=>loadJSON(PLAN_STORE_KEY,DEFAULT_PLAN));
  const [weekOffset, setWeekOffset] = useState(0);
  const [tab,        setTab]        = useState("calendar");
  const [planEdit,   setPlanEdit]   = useState(false);
  const [logModal,   setLogModal]   = useState(null);
  const weekKey=getWeekKey(weekOffset);
  const savePlan=np=>{ setPlan(np); saveJSON(PLAN_STORE_KEY,np); };
  const saveLog=(dayIdx,wk,rec)=>{
    setLogData(prev=>{ const n={...prev,[wk]:{...(prev[wk]||{}),[dayIdx]:rec}}; saveJSON(STORAGE_KEY,n); return n; });
  };
  const openLog=(dayIdx,wk)=>setLogModal({dayIdx,weekKey:wk});

  return(
    <div style={{minHeight:"100vh",background:"#0A0A0A",color:"#E0E0E0",fontFamily:"'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif",maxWidth:480,margin:"0 auto",paddingBottom:80}}>

      {/* 헤더 */}
      <div style={{padding:"22px 18px 14px",borderBottom:"1px solid #1a1a1a",position:"sticky",top:0,zIndex:20,background:"#0A0A0A"}}>
        <div style={{fontSize:S.xs,letterSpacing:4,color:"#E8572A",marginBottom:4,fontFamily:"monospace"}}>NORWEGIAN SINGLES METHOD</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:S.xl,fontWeight:700,letterSpacing:0.5}}>런닝 트레이닝 로그</div>
          <button onClick={()=>setPlanEdit(true)} style={{background:"none",border:"1px solid #2a2a2a",color:"#888",padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:S.sm}}>플랜 편집</button>
        </div>
      </div>

      {/* 탭 */}
      <div style={{display:"flex",borderBottom:"1px solid #1a1a1a"}}>
        {[["calendar","📅  캘린더"],["week","📋  주간 목록"]].map(([key,lbl])=>(
          <button key={key} onClick={()=>setTab(key)} style={{flex:1,padding:"14px 0",background:"none",border:"none",color:tab===key?"#E8572A":"#555",borderBottom:`2px solid ${tab===key?"#E8572A":"transparent"}`,fontSize:S.md,cursor:"pointer",transition:"all .2s",fontFamily:"inherit"}}>{lbl}</button>
        ))}
      </div>

      <div style={{padding:"18px 16px"}}>
        {tab==="calendar"&&<CalendarView plan={plan} logData={logData} onLogDay={openLog}/>}
        {tab==="week"&&(
          <>
            <WeekNav weekOffset={weekOffset} setWeekOffset={setWeekOffset}/>
            <WeekView plan={plan} logData={logData} onLogDay={i=>openLog(i,weekKey)} weekKey={weekKey}/>
          </>
        )}
      </div>

      {logModal&&(
        <LogModal planItem={plan[logModal.dayIdx]} dayIdx={logModal.dayIdx} weekKey={logModal.weekKey}
          logData={logData} onSave={saveLog} onClose={()=>setLogModal(null)}/>
      )}
      {planEdit&&(
        <PlanEditModal plan={plan} onSave={savePlan} onClose={()=>setPlanEdit(false)}/>
      )}

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,padding:"13px 18px",background:"#0A0A0A",borderTop:"1px solid #1a1a1a",textAlign:"center",fontSize:S.xs,color:"#333"}}>
        날짜 탭 → 결과 기록 · 플랜 편집 → 드래그로 세션 이동
      </div>
    </div>
  );
}
