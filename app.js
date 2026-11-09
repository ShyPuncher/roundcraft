'use strict';
const DEFAULTS = {
 mode:'boxing',wake:true,sound:true,vibrate:true,
 boxing:{prep:20,work:180,rest:60,rounds:4,cooldown:30},
 tabata:{prep:5,work:30,rest:15,rounds:4,cycles:3,cycleRest:30,cooldown:30},
 stopwatch:{prep:5,lap:10},
 colors:{prep:'#ffff33',work:'#88fa37',rest:'#f44336',cycleRest:'#f9cf34',cooldown:'#39afe7',paused:'#969696',done:'#ffffff',idle:'#a3e635'}
};
function clone(x){return JSON.parse(JSON.stringify(x))}
function load(){try{let s=JSON.parse(localStorage.getItem('roundkit-v1'));return { ...clone(DEFAULTS),...s,boxing:{...DEFAULTS.boxing,...s.boxing},tabata:{...DEFAULTS.tabata,...s.tabata},stopwatch:{...DEFAULTS.stopwatch,...s.stopwatch},colors:{...DEFAULTS.colors,...s.colors}}}catch{return clone(DEFAULTS)}}
const state=load();
function persist(){try{localStorage.setItem('roundkit-v1',JSON.stringify(state))}catch{}}
const $=id=>document.getElementById(id);
const modes={boxing:'라운드',tabata:'타바타',stopwatch:'스톱워치'};
const schema={
 boxing:[['prep','준비','시작하기 전 카운트다운',0,300,5,'prep'],['work','운동','1라운드 운동시간',1,600,30,'work'],['rest','휴식','라운드 사이 회복시간',0,300,10,'rest'],['rounds','라운드','총 진행 라운드 수',1,10,1,'cooldown'],['cooldown','쿨다운','마지막 운동 후 정리시간',0,600,10,'cooldown']],
 tabata:[['prep','준비','시작하기 전 카운트다운',0,300,5,'prep'],['work','운동','라운드별 운동시간',1,600,5,'work'],['rest','휴식','라운드 사이 휴식시간',0,300,5,'rest'],['rounds','라운드','1사이클에 포함된 라운드 수',1,30,1,'cooldown'],['cycles','사이클','사이클 반복 횟수',1,30,1,'cycleRest'],['cycleRest','사이클 사이에 휴식','사이클 종료 후 회복 간격',0,600,10,'cycleRest'],['cooldown','쿨다운','운동 종료 후 정리시간',0,600,10,'cooldown']],
 stopwatch:[['prep','준비','시작하기 전 카운트다운',0,300,5,'prep'],['lap','타임 랩','간격마다 알림음 (0은 해제)',0,3600,5,'work']]
};
let engine={status:'idle',mode:state.mode,phases:[],index:0,phaseStartedAt:0,phaseEndsAt:0,remaining:0,stopElapsed:0,stopStartedAt:0,lastWhole:null,lastLap:0};
let wakeLock=null,audioCtx=null,renderInterval=null;
function fmt(s){s=Math.max(0,Math.ceil(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`}
function buildPhases(mode){const s=state[mode],p=[];const push=(type,duration,round,cycle)=>{if(duration>0)p.push({type,duration,round,cycle})};push('prep',s.prep,0,0);
 if(mode==='boxing'){for(let r=1;r<=s.rounds;r++){push('work',s.work,r,1);if(r<s.rounds)push('rest',s.rest,r,1)}push('cooldown',s.cooldown,s.rounds,1)}
 if(mode==='tabata'){for(let c=1;c<=s.cycles;c++){for(let r=1;r<=s.rounds;r++){push('work',s.work,r,c);if(r<s.rounds)push('rest',s.rest,r,c)}if(c<s.cycles)push('cycleRest',s.cycleRest,s.rounds,c)}push('cooldown',s.cooldown,s.rounds,s.cycles)}return p}
function phaseName(type){return {prep:'준비',work:'운동',rest:'휴식',cycleRest:'사이클 휴식',cooldown:'쿨다운',paused:'일시정지',done:'완료',idle:'준비 완료'}[type]||'준비'}
function activePhase(){return engine.phases[engine.index]}
// Audio files play through HTMLAudioElement; a user press unlocks media on iOS.
const soundPlayers={
  bell:new Audio('./boxing-bell.wav'),
  count:new Audio('./countdown.wav'),
  rest:new Audio('./rest-tone.wav')
};
Object.values(soundPlayers).forEach(player=>{player.preload='auto';player.playsInline=true;player.load()});
let audioUnlocked=false;
function setAudioMessage(message,warning=false){
 const el=$('audioStatus');if(el){el.textContent=message;el.style.color=warning?'#ffb86b':'#a6d979'}
}
function unlockAudio(){
 if(!state.sound)return;
 try{
  const C=window.AudioContext||window.webkitAudioContext;
  if(C){if(!audioCtx)audioCtx=new C();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});}
 }catch{}
}
function fallbackBeep(kind){
 try{
  unlockAudio();if(!audioCtx||audioCtx.state!=='running')return;
  const now=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=kind==='count'?'sine':'triangle';o.frequency.value=kind==='rest'?520:kind==='count'?880:930;
  g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(.4,now+.015);
  g.gain.exponentialRampToValueAtTime(.001,now+(kind==='count'?.16:.55));
  o.connect(g).connect(audioCtx.destination);o.start(now);o.stop(now+(kind==='count'?.17:.57));
 }catch{}
}
function beep(kind='change',force=false){
 if(!state.sound&&!force)return;
 unlockAudio();
 const sound=kind==='count'?'count':(engine.mode==='boxing'||kind==='finish'?'bell':kind==='rest'?'rest':'count');
 const player=soundPlayers[sound];
 try{
  player.pause();player.currentTime=0;
  const attempt=player.play();
  if(attempt&&typeof attempt.then==='function')attempt.then(()=>{audioUnlocked=true;setAudioMessage('알림음 재생 준비 완료')}).catch(err=>{
    fallbackBeep(kind);
    setAudioMessage(err?.name==='NotAllowedError'?'소리 재생이 차단됨 · 테스트 버튼을 눌러 허용해 주세요':'소리 재생 실패 · 볼륨과 무음 모드 확인',true);
  });
 }catch(err){fallbackBeep(kind);setAudioMessage('소리 재생에 실패했습니다. 알림음 테스트를 눌러주세요.',true)}
}
function vibrate(){if(state.vibrate&&'vibrate' in navigator)try{navigator.vibrate(140)}catch{}}
async function requestWake(){if(!state.wake||engine.status!=='running'||!('wakeLock' in navigator)||document.visibilityState!=='visible')return;try{if(!wakeLock)wakeLock=await navigator.wakeLock.request('screen');$('wakeSub').textContent='화면 유지 활성화'}catch{$('wakeSub').textContent='현재 환경에서 화면 유지가 제한됩니다'}}
async function releaseWake(){if(wakeLock){try{await wakeLock.release()}catch{}wakeLock=null}$('wakeSub').textContent='지원 환경에서 운동 중 화면 유지'}
function finish(){engine.status='done';engine.remaining=0;beep('finish');vibrate();releaseWake();render()}
function enterPhase(index,startAt,signal=true){engine.index=index;let p=activePhase();if(!p){finish();return}engine.phaseStartedAt=startAt;engine.phaseEndsAt=startAt+p.duration*1000;engine.remaining=p.duration;engine.lastWhole=null;if(signal){beep(p.type==='rest'||p.type==='cycleRest'?'rest':'change');vibrate()}}
function start(){unlockAudio();if(engine.status==='paused'){const now=Date.now();if(engine.mode==='stopwatch')engine.stopStartedAt=now;else{engine.phaseStartedAt=now-(activePhase().duration-engine.remaining)*1000;engine.phaseEndsAt=now+engine.remaining*1000}engine.status='running';requestWake();render();return}
 engine.mode=state.mode;engine.status='running';engine.lastLap=0;engine.stopElapsed=0;engine.stopStartedAt=Date.now();if(engine.mode==='stopwatch'){let prep=state.stopwatch.prep;engine.phases=prep?[{type:'prep',duration:prep}]:[];if(prep)enterPhase(0,Date.now(),true);else beep('change')}
 else{engine.phases=buildPhases(engine.mode);enterPhase(0,Date.now(),true)}requestWake();render()}
function pause(){if(engine.status!=='running')return;tick();if(engine.status!=='running')return;if(engine.mode==='stopwatch'&&engine.phases.length===0)engine.stopElapsed+=Date.now()-engine.stopStartedAt;engine.status='paused';releaseWake();render()}
function reset(){engine={status:'idle',mode:state.mode,phases:[],index:0,phaseStartedAt:0,phaseEndsAt:0,remaining:0,stopElapsed:0,stopStartedAt:0,lastWhole:null,lastLap:0};releaseWake();render()}
function skip(){if(engine.status==='idle'||engine.status==='done')return;unlockAudio();if(engine.mode==='stopwatch'){if(engine.phases.length){engine.phases=[];engine.stopStartedAt=Date.now();engine.stopElapsed=0;engine.status='running';beep('change')}else{engine.stopElapsed=0;engine.stopStartedAt=Date.now();engine.lastLap=0}render();return}
 if(engine.status==='paused')engine.status='running';enterPhase(engine.index+1,Date.now());requestWake();render()}
function tick(){if(engine.status!=='running')return;const now=Date.now();if(engine.mode==='stopwatch'){
 if(engine.phases.length){if(now>=engine.phaseEndsAt){engine.phases=[];engine.stopElapsed=0;engine.stopStartedAt=engine.phaseEndsAt;beep('change');vibrate()}else{engine.remaining=(engine.phaseEndsAt-now)/1000;countBeep(engine.remaining)}}
 else{const interval=state.stopwatch.lap*1000,elapsed=engine.stopElapsed+(now-engine.stopStartedAt);if(interval>0){let currentLap=Math.floor(elapsed/interval);if(currentLap>engine.lastLap){engine.lastLap=currentLap;if(currentLap>0){beep('change');vibrate()}}}}}
 else{let loops=0;while(engine.status==='running'&&now>=engine.phaseEndsAt&&loops++<1000){enterPhase(engine.index+1,engine.phaseEndsAt)}if(engine.status==='running'){engine.remaining=(engine.phaseEndsAt-now)/1000;countBeep(engine.remaining)}}render()}
function countBeep(remaining){const whole=Math.ceil(remaining);if(whole!==engine.lastWhole){if(whole>=1&&whole<=3)beep('count');engine.lastWhole=whole}}
function displayStatus(){if(engine.status==='idle')return 'idle';if(engine.status==='done')return 'done';if(engine.status==='paused')return 'paused';if(engine.mode==='stopwatch'&&!engine.phases.length)return 'work';return activePhase()?.type||'idle'}
function render(){const mode=state.mode,phase=displayStatus(),running=engine.status==='running',paused=engine.status==='paused',panel=$('timerPanel');panel.className='timer-panel phase-'+phase+(running?' running':'');panel.style.setProperty('--phase',state.colors[phase]||state.colors.idle);
 let seconds,progress=0,sub='',pos='';let s=state[mode];
 if(engine.status==='idle'){seconds=mode==='stopwatch'?0:s.work;pos=mode==='boxing'?`ROUND 1 / ${s.rounds}`:mode==='tabata'?`CYCLE 1 / ${s.cycles}`:'STOPWATCH';sub='시작을 누르면 타이머가 작동합니다'}
 else if(engine.status==='done'){seconds=0;pos='FINISH';sub='오늘의 운동 완료'}
 else if(mode==='stopwatch'){if(engine.phases.length){seconds=engine.remaining;pos='GET READY';progress=1-engine.remaining/state.stopwatch.prep;sub='곧 측정을 시작합니다'}else{seconds=(engine.stopElapsed+(running?Date.now()-engine.stopStartedAt:0))/1000;pos='STOPWATCH';progress=s.lap>0?(seconds%s.lap)/s.lap:0;sub=s.lap?`${fmt(s.lap)}마다 알림 · 경과시간`:'경과시간 측정 중'}}
 else{const p=activePhase();seconds=engine.remaining;progress=p?1-engine.remaining/p.duration:0;pos=mode==='boxing'?`ROUND ${p?.round||1} / ${s.rounds}`:`CYCLE ${p?.cycle||1}/${s.cycles} · ${p?.round||1}/${s.rounds}R`;sub=p?.type==='prep'?'곧 운동이 시작됩니다':p?.type==='work'?'운동에 집중하세요':p?.type==='rest'?'다음 라운드를 준비하세요':p?.type==='cycleRest'?'다음 사이클 준비':'호흡을 정리하세요'}
 $('phaseLabel').textContent=engine.status==='paused'?'일시정지':phaseName(phase);$('progressLabel').textContent=pos;$('timeDisplay').textContent=fmt(seconds);$('secondaryLabel').textContent=sub;$('progressFill').style.width=Math.min(100,Math.max(0,progress*100))+'%';$('primaryText').textContent=running?'일시정지':paused?'계속':engine.status==='done'?'다시 시작':'시작';$('primarySymbol').textContent=running?'Ⅱ':'▶';$('skipBtn').disabled=engine.status==='idle'||engine.status==='done';$('skipBtn').style.opacity=$('skipBtn').disabled?'.4':'1';
}
function changeMode(mode){state.mode=mode;persist();reset();document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('settingsTitle').textContent=modes[mode]+' 설정';buildSettings();render()}
function buildSettings(){const wrapper=$('settingsFields');wrapper.replaceChildren();for(const [key,title,desc,min,max,step,color] of schema[state.mode]){const row=document.createElement('div');row.className='setting-row';const label=document.createElement('div');label.className='setting-caption';const dot=document.createElement('span');dot.className='color-bullet';dot.style.background=state.colors[color];let strong=document.createElement('strong');strong.append(dot,document.createTextNode(title));let small=document.createElement('small');small.textContent=desc;label.append(strong,small);const controls=document.createElement('div');controls.className='number-set';const minus=document.createElement('button'),plus=document.createElement('button'),input=document.createElement('input'),unit=document.createElement('span');minus.className=plus.className='stepper';minus.textContent='−';plus.textContent='+';minus.setAttribute('aria-label',title+' 감소');plus.setAttribute('aria-label',title+' 증가');input.type='number';input.inputMode='numeric';input.className='num-input';input.min=min;input.max=max;input.step=1;input.value=state[state.mode][key];input.setAttribute('aria-label',title);unit.className='unit';unit.textContent=key==='rounds'||key==='cycles'?'회':'초';function set(v){const n=Math.round(Number(v));if(!Number.isFinite(n))return;state[state.mode][key]=Math.min(max,Math.max(min,n));input.value=state[state.mode][key];persist();reset()}minus.onclick=()=>set(state[state.mode][key]-step);plus.onclick=()=>set(state[state.mode][key]+step);input.addEventListener('change',()=>set(input.value||min));controls.append(minus,input,plus,unit);row.append(label,controls);wrapper.append(row)}}
function buildColors(){const wrap=$('colorsList');wrap.replaceChildren();for(const [key,label] of Object.entries({prep:'준비',work:'운동',rest:'휴식',cycleRest:'사이클 휴식',cooldown:'쿨다운',paused:'일시정지',done:'완료',idle:'시작 전'})){const row=document.createElement('label');row.className='color-row';const span=document.createElement('span');span.textContent=label;const input=document.createElement('input');input.type='color';input.value=state.colors[key];input.oninput=()=>{state.colors[key]=input.value;persist();render();buildSettings()};row.append(span,input);wrap.append(row)}}
$('soundTestBtn').onclick=()=>{state.sound=true;$('soundToggle').checked=true;persist();unlockAudio();beep('change',true)};$('primaryBtn').onclick=()=>engine.status==='running'?pause():start();$('resetBtn').onclick=reset;$('skipBtn').onclick=skip;document.querySelectorAll('.mode-tab').forEach(b=>b.onclick=()=>changeMode(b.dataset.mode));$('wakeToggle').checked=state.wake;$('soundToggle').checked=state.sound;$('vibrateToggle').checked=state.vibrate;$('wakeToggle').onchange=e=>{state.wake=e.target.checked;persist();state.wake?requestWake():releaseWake()};$('soundToggle').onchange=e=>{state.sound=e.target.checked;persist();if(state.sound)unlockAudio()};$('vibrateToggle').onchange=e=>{state.vibrate=e.target.checked;persist()};$('prefsButton').onclick=()=>{buildColors();$('prefsDialog').showModal()};$('resetColors').onclick=()=>{state.colors=clone(DEFAULTS.colors);persist();buildColors();buildSettings();render()};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(engine.status==='running')requestWake();tick()}else{releaseWake()}});
window.addEventListener('pagehide',releaseWake);
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(()=>{$('offlineLabel').textContent='· 오프라인 사용 지원'}).catch(()=>{$('offlineLabel').textContent='· HTTPS로 배포 시 오프라인 지원'}))}
changeMode(state.mode);renderInterval=setInterval(tick,100);if(!('wakeLock' in navigator))$('wakeSub').textContent='이 브라우저에서는 화면 유지 미지원';
