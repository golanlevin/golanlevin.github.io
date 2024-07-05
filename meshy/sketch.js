// Meshy (1998, 2024) by Golan Levin
// https://www.flong.com/archive/projects/meshy
// https://www.youtube.com/watch?v=MzCPUBve6xE
// https://vimeo.com/223001204
// Meshy is an interactive environment in which the user's
// strokes scaffold a gauzy mesh of animated elements. The mesh
// continually bridges the user's two most recent marks.
// By drawing, users can tease the mesh in real-time.
// Written in JavaScript with the HTML5 Canvas API.
//
// Draw two marks to begin.
// Key commands:
// f: toggle Fullscreen
// a: toggle Autoplay
// d: toggle Debug
// n: generate New mesh
// r: Reset system
// h: show Help

let Cnvs;
let myABRandom;let myABFeatures;let meshyStyle=0;
let ctx,nClx,currSamp,fSinceMUp;
let currAutoF=0;let currPathI=0;
let myTch=[];

const nPaths=2;
const maxNPaths=2;
const nBezSamp=375;
const quadDim=0.0175;
const nResamp=75;
const nFadeFrames=80;
const txSize=14;
const showHelpDur=4000;
const waitToAutoDur=30000;
const autoLen=360;
const auDel=120;
const tau=2*Math.PI;
const F=false;
const T=true;

let myMX=0;let myMY=0;
let splStr=10;
let myW,myH;
let pathAr=[];
let pathBzAr=[];
let drawArr=[];
let bt=[];
let bt2=[];
let bt3=[];
let omt=[];
let omt2=[];
let omt3=[];
let bto2=[];
let bt2o=[];

let bShowInf=bEnableAut=T;
let bBegun=bSpecialCase=bDrawDebug=bAut=bMPressed=F;
let begunT,appStartT,lastPokeT,helpStartT,startDebugT;
let tapCount=0;

const MWHALE=0;
const MSCRIB=1;
const MSTEER=2;
const MMIXY1=3;
const MMIXY2=4;
const MWHAL2=5;
const MSTER2=6;
const MSRIB2=7;
let gestA=[];let gestB=[];
let clix=[];
let CHASH;

function setup(){
Cnvs=document.createElement('canvas');
Cnvs.width=720;Cnvs.height=405;
document.body.appendChild(Cnvs);
setInterval(myDraw,1000/60);
appStartT=Date.now();lastPokeT=startDebugT=0;
onResizeCanvas();
window.addEventListener('mousedown',onMouseDown);
window.addEventListener('mousemove',onMouseMove);
window.addEventListener('mouseup',onMouseUp);
window.addEventListener('keydown',onKeyPress);
window.addEventListener('resize',onResizeCanvas);
document.addEventListener('fullscreenchange',onResizeCanvas);
document.addEventListener('webkitfullscreenchange',onResizeCanvas);
document.addEventListener('mozfullscreenchange',onResizeCanvas);
document.addEventListener('msfullscreenchange',onResizeCanvas);
Cnvs.addEventListener('touchstart',onTouchStart);
Cnvs.addEventListener('touchmove',onTouchMove);
Cnvs.addEventListener('touchend',onTouchEnd);
Cnvs.style.cursor='crosshair';
CHASH=tokenData.hash;
myRandomReset(CHASH);
myABFeatures=calculateFeatures(tokenData);
meshyStyle=myABFeatures.Style;
let sty=getOpt([[0,25],[1,8],[2,2],[3,15],[4,5],[5,15],[6,15],[7,10]]);//needed
initMeshy();}

function onResizeCanvas(){
const pxRat=window.devicePixelRatio||1;
myW=window.innerWidth;myH=window.innerHeight;
Cnvs.width=myW*pxRat;Cnvs.height=myH*pxRat;
Cnvs.style.width=myW+'px';Cnvs.style.height=myH+'px';
ctx=Cnvs.getContext('2d');ctx.scale(pxRat,pxRat);}

function initMeshy(){
fSinceMUp=currSamp=nClx=currPathI=0;
helpStartT=myMils();
pathAr=new Array(maxNPaths);
pathBzAr=new Array(maxNPaths);
drawArr=new Array(maxNPaths);
makeBezArrays();
for(let i=0;i<maxNPaths;i++){
pathAr[i]=[];pathBzAr[i]=[];
drawArr[i]=new Array(nResamp);
for(let j=0;j<nResamp;j++){
drawArr[i][j]=new Vec3f();
}}createStarter();}

function makeBezArrays(){
for(let p=0;p<nBezSamp;p++){bt[p]=p/(nBezSamp-1);
bt2[p]=bt[p]*bt[p];bt3[p]=bt[p]*bt2[p];omt[p]=1-bt[p];
omt2[p]=omt[p]*omt[p];omt3[p]=omt[p]*omt2[p];
bto2[p]=3*bt[p]*omt2[p];bt2o[p]=3*bt2[p]*omt[p];}}

function myDraw(){
ctx.fillStyle='black';ctx.fillRect(0,0,myW,myH);
simulate();render();drawDebug();drawInfo();autoPlay();}

function autoPlay(){
if(bEnableAut){let prevbAut=bAut;
let elapsed=myMils()-lastPokeT;bAut=(elapsed>waitToAutoDur);
let splen=autoLen-auDel;let pt;if(bAut&&!prevbAut){
currAutoF=0;autoPress();}else if(!bAut&&prevbAut){
pt=getAutoPt(currAutoF/splen);myMouseReleased(pt.x,pt.y);
}else if(bAut){Cnvs.style.cursor='none';
if(currAutoF<autoLen){currAutoF++;if(currAutoF<splen){
pt=getAutoPt(currAutoF/splen);myMouseDragged(pt.x,pt.y);}
}else{pt=getAutoPt(currAutoF/splen);myMouseReleased(pt.x,pt.y);autoPress();}
}else if(!bAut){Cnvs.style.cursor='crosshair';}}}

let ap1,ap2,ap3,ap4;
function autoPress(){currAutoF=0;let a=-0.3;let b=1.3;
ap1=new Vec3f(myW*myRAB(0,1),myH*myRAB(a,b),0);
ap2=new Vec3f(myW*myRAB(a,b),myH*myRAB(a,b),0);
ap3=new Vec3f(myW*myRAB(a,b),myH*myRAB(a,b),0);
ap4=new Vec3f(myW*myRAB(0,1),myH*myRAB(a,b),0);
let pt=getAutoPt(currAutoF/(autoLen-auDel));
myMousePressed(pt.x,pt.y);}

function getAutoPt(t){
let pt=calcPureBezVec3f(t,ap1,ap2,ap3,ap4);
return new Vec3f(pt.x,pt.y,0);}

function drawDebug(){
if(bDrawDebug){let cols=["lime","red"];for(let j=0;j<2;j++){
ctx.strokeStyle=cols[j];ctx.beginPath();
for(let i=0;i<pathAr[j].length;i++){
let px=pathAr[j][i].x;let py=pathAr[j][i].y;
if(i==0){ctx.moveTo(px,py);}ctx.lineTo(px,py);}ctx.stroke();}
let elapsed=myMils()-startDebugT;if(bAut||(elapsed>120000)){
bDrawDebug=F;}}}

function simulate(){currSamp++;fSinceMUp++;blurGesture();}

function blurGesture(){
if(bMPressed){let A=0.025;let B=1-2*A;
let path=pathAr[currPathI];let npm1=path.length-1;
if(npm1>2){for(let i=1;i<npm1;i++){
let v0=path[i-1],v1=path[i],v2=path[i+1];
let px=A*v0.x+B*v1.x+A*v2.x;let py=A*v0.y+B*v1.y+A*v2.y;
let pz=A*v0.z+B*v1.z+A*v2.z;path[i].set(px,py,pz);}
calcBezPath(currPathI);resampVec(currPathI);}}}

function render(){
if(nClx>0){let offset=(bMPressed)?0:-1;
let fromI=(currPathI-1+offset+nPaths)%nPaths;
let toI=(currPathI+offset+nPaths)%nPaths;drawStem(pathBzAr[toI]);
if((toI%2==1)||bAut||(myTch.length>1)){drawStem(pathBzAr[fromI]);}
if(nClx!=1||currPathI!=1||bSpecialCase){
let num=nPaths-1;if(nClx<nPaths){num=currPathI;}
for(let i=0;i<=num;i++){
fromI=(i-1+offset+nPaths)%nPaths;toI=(i+offset+nPaths)%nPaths;
if(toI%2==1){let fromArr=drawArr[fromI];let toArr=drawArr[toI];
if(nPaths==2||currPathI!=(fromI-offset)%nPaths){
drawMesh(fromArr,toArr);}}}}}else{let n=Math.min(nClx,nPaths);
for(let p=0;p<=n;p++){drawStem(pathBzAr[p]);}}}

function drawInfo(){
if(bShowInf){ctx.font=txSize+"px 'Times New Roman'";
ctx.textAlign='center';ctx.textBaseline='middle';
let str=[];
str.push("𝑀𝑒𝑠ℎ𝑦 (1998, 2024) by Golan Levin");
str.push("Interactive Gestural Abstraction");
str.push("⸻");
str.push("Draw two marks to begin");
str.push("Dibuja dos marcas para comenzar");
str.push("Tracez deux marques pour commencer");
str.push("Desenhe duas marcas para começar");
str.push("Zeichnen Sie zwei Markierungen, um zu beginnen");
str.push("Нарисуйте две отметки, чтобы начать");
str.push("始めるために2つの線を描いてください");
str.push("आरंभ करने के लिए दो निशान बनाएं");
str.push("ارسم علامتين للبدء");
str.push("画两条线开始");
let elapsed=myMils()-helpStartT;
if(elapsed>showHelpDur){bShowInf=F;
}else{let tx=myW/2;let ty=myH/4;
let ry=ty+((txSize)*5.5);
let frac=Math.min(1,elapsed/showHelpDur);
frac=1-Math.pow(frac,2.5);
for(let i=1;i<30;i++){let tw=i*14;let th=i*11;
ctx.fillStyle="rgba(0,0,0,"+(frac/10)+")";
ctx.beginPath();ctx.ellipse(tx,ry,tw/2,th/2,0,0,tau);
ctx.closePath();ctx.fill();}
ctx.fillStyle="rgba(255,255,255,"+frac+")";
for(let i=0;i<str.length;i++){
ctx.fillText(str[i],myW/2,myH/4+i*txSize*1.125);}}}}

function createStarter(){	
nClx=currPathI=0;
for(let p=0;p<pathBzAr.length;p++){
pathAr[p]=[];pathBzAr[p]=[];}
genStarterGestures();
let srcGest=[gestA,gestB];
for(let g=0;g<2;g++){let aGest=srcGest[g];
for(let i=0;i<aGest.length;i++){
let p=aGest[i];pathAr[currPathI].push(new Vec3f(p.x,p.y,0));}
calcBezPath(currPathI);resampVec(currPathI);
nClx++;currPathI=nClx%nPaths;}
fSinceMUp=nFadeFrames;}

function onKeyPress(ev){
lastPokeT=myMils();let k=ev.key.toLowerCase();
if(k=='d'){bDrawDebug=!bDrawDebug;
if(bDrawDebug)startDebugT=myMils();
}else if(k=='f'){togFullScr();
}else if(k=='r'){myRandomReset(CHASH);
meshyStyle=getOpt([[0,25],[1,8],[2,2],[3,15],[4,5],[5,15],[6,15],[7,10]]);
createStarter();bShowInf=T;helpStartT=myMils();
}else if(k=='n'){
meshyStyle=getOpt([[0,25],[1,8],[2,2],[3,15],[4,5],[5,15],[6,15],[7,10]]);
createStarter();
}else if(k=='a'){bEnableAut=!bEnableAut;
}else{bShowInf=!bShowInf;if(bShowInf){helpStartT=myMils();}}}

function handleToggleClix(mx,my){
clix.push(new Vec3f(mx,my,0));if(clix.length>10){clix.splice(0,1);let dh=0;
for(let i=0;i<9;i++){let dx=clix[i+1].x-clix[i].x;let dy=clix[i+1].y-clix[i].y;
dh=Math.max(dh,Math.sqrt(dx*dx+dy*dy));}
if(dh<20){clix=[];togFullScr();}}}

function togFullScr(){
if(!document.fullscreenElement&&!document.webkitFullscreenElement){
if(Cnvs.requestFullscreen){Cnvs.requestFullscreen();
}else if(Cnvs.webkitRequestFullscreen){Cnvs.webkitRequestFullscreen();}
}else{if(document.exitFullscreen){document.exitFullscreen();
}else if(document.webkitExitFullscreen){document.webkitExitFullscreen();}}}

function onMouseMove(ev){
lastPokeT=myMils();const rect=Cnvs.getBoundingClientRect();
myMX=ev.clientX-rect.left;myMY=ev.clientY-rect.top;
if(bMPressed){myMouseDragged(myMX,myMY);}}

function myMouseDragged(mx,my){
bBegun=T;pathAr[currPathI].push(new Vec3f(mx,my,0));
fSinceMUp=0;calcBezPath(currPathI);resampVec(currPathI);}

function onMouseDown(ev){
bAut=F;bMPressed=T;lastPokeT=myMils();
const rect=Cnvs.getBoundingClientRect();
myMX=ev.clientX-rect.left;myMY=ev.clientY-rect.top;
myMousePressed(myMX,myMY);handleToggleClix(myMX,myMY);}

function myMousePressed(mx,my){
if(!bBegun){begunT=myMils();
pathAr[0]=[];pathAr[1]=[];pathBzAr[0]=[];pathBzAr[1]=[];
currPathI=1;nClx=0;bBegun=T;}
bSpecialCase=F;if((nClx==1)&&(currPathI==1)){
bSpecialCase=T;}currPathI=nClx%nPaths;
pathAr[currPathI]=[];pathBzAr[currPathI]=[];
pathAr[currPathI].push(new Vec3f(mx,my,0));
pathAr[currPathI].push(new Vec3f(mx+1,my+1,0));
fSinceMUp=0;calcBezPath(currPathI);resampVec(currPathI);}

function onMouseUp(ev){
bAut=F;lastPokeT=myMils();
const rect=Cnvs.getBoundingClientRect();
myMX=ev.clientX-rect.left;myMY=ev.clientY-rect.top;
myMouseReleased(myMX,myMY);}

function myMouseReleased(mx,my){
bMPressed=F;calcBezPath(currPathI);resampVec(currPathI);
nClx++;currPathI=nClx%nPaths;fSinceMUp=0;bSpecialCase=F;}

function onTouchStart(ev){
if(ev.touches.length>2){myTch=[];return;}
ev.preventDefault();if(myTch.length<2){
let which=-1;let mx=-1,my=-1;
for(let tu of ev.touches){let existI=-1;
for(let i=0;i<myTch.length;i++){
if(myTch[i].id===tu.identifier){
existI=i;break;}}mx=tu.clientX;my=tu.clientY;
if(existI>-1){which=existI;
myTch[existI].x=mx;myTch[existI].y=my;
}else{handleToggleClix(mx,my);
currPathI=(currPathI+1)%2;
which=currPathI;if(myTch.length<2){
myTch.push({id:tu.identifier,x:mx,y:my});
}}}if(which!=-1){bBegun=T;fSinceMUp=0;bAut=F;
lastPokeT=myMils();bMPressed=myTch.length==1;
pathAr[which]=[];pathBzAr[which]=[];
pathAr[which].push(new Vec3f(mx,my,0));
calcBezPath(which);resampVec(which);
if(myTch.length==2){pathAr[(which+1)%2]=[];
pathBzAr[(which+1)%2]=[];}}}}

function onTouchMove(ev){
if(ev.touches.length>2){myTch=[];return;}
ev.preventDefault();
for(let tu of ev.touches){
for(let i=0;i<myTch.length;i++){
if(myTch[i].id===tu.identifier){
let mx=tu.clientX;let my=tu.clientY;
myTch[i].x=mx;myTch[i].y=my;
fSinceMUp=0;lastPokeT=myMils();
let which=(myTch.length==1)?currPathI:(currPathI+i+1)%2;
pathAr[which].push(new Vec3f(mx,my,0));
calcBezPath(which);resampVec(which);break;}}}}

function onTouchEnd(ev){
ev.preventDefault();myTch=[];bAut=F;
bSpecialCase=bMPressed=F;lastPokeT=myMils();fSinceMUp=0;}

function getPathLen(path){
let len=0;for(let i=0;i<(path.length-1);i++){
let lo=path[i],hi=path[i+1];
let dx=lo.x-hi.x,dy=lo.y-hi.y;
len+=Math.sqrt(dx*dx+dy*dy);}return len;}

function calcBezPath(pathIndex){
const nBez=10;let path=pathAr[pathIndex];
pathBzAr[pathIndex]=[];
let nSourcePts=path.length;
let p0=new Vec3f();let p1=new Vec3f();
let p2=new Vec3f();let p3=new Vec3f();
let last_pt=new Vec3f();let next_pt=new Vec3f();
if(nSourcePts<5){for(let g=0;g<nSourcePts;g++){
let src=path[g];
pathBzAr[pathIndex].push(new Vec3f(src.x,src.y,0));
}}else{for(let i=0;i<nSourcePts;i++){
if(i==1){p3=path[1],p0=path[0];next_pt=path[2];
last_pt.set(p0.x-(p3.x-p0.x)/4,p0.y-(p3.y-p0.y)/4,0);
}else if(i==0){next_pt=path[1],p3=path[0];
p0.set(p3.x-(next_pt.x-p3.x)/4,p3.y-(next_pt.y-p3.y)/4,0);
last_pt.set(p3.x-(next_pt.x-p3.x)/2,p3.y-(next_pt.y-p3.y)/2,0);
}else if(i==nSourcePts-1){p3=path[i],p0=path[i-1];
last_pt=path[i-2];next_pt=p3;
}else{p3=path[i],p0=path[i-1];
last_pt=path[i-2];next_pt=path[i+1];}
let dx0=p0.x-last_pt.x;let dy0=p0.y-last_pt.y;
let d0=Math.sqrt(dx0*dx0+dy0*dy0);
let dx1=p3.x-p0.x;let dy1=p3.y-p0.y;
let d1=Math.sqrt(dx1*dx1+dy1*dy1);
let dx2=next_pt.x-p3.x;let dy2=next_pt.y-p3.y;
let d2=Math.sqrt(dx2*dx2+dy2*dy2);
let dAtp0=(d0+d1)/2;let dAtp3=(d1+d2)/2;
p0.set(p0.x,p0.y,dAtp0);p3.set(p3.x,p3.y,dAtp3);
let tan_inx=(p3.x-last_pt.x)/6;
let tan_iny=(p3.y-last_pt.y)/6;
let tan_inz=(p3.z-d0)/6;
let tan_outx=(next_pt.x-p0.x)/6;
let tan_outy=(next_pt.y-p0.y)/6;
let tan_outz=(d2-p0.z)/6;
let p1x=p0.x+tan_inx;let p1y=p0.y+tan_iny;let p1z=p0.z+tan_inz;
let p2x=p3.x-tan_outx;let p2y=p3.y-tan_outy;let p2z=p3.z-tan_outz;
p1.set(p1x,p1y,p1z);p2.set(p2x,p2y,p2z);
for(let j=0;j<nBez;j++){let pt=calcPureBezVec3f(j/nBez,p0,p1,p2,p3);
pathBzAr[pathIndex].push(pt);}}}}

function resampVec(I){
let path=pathBzAr[I];
let resampledPath=drawArr[I];
let nResampPts=nResamp;
let nPathPts=path.length;
if(nPathPts>0){
let totalPathLength=getPathLen(path);
let RSL=totalPathLength/nResampPts;
let prevRem=RSL;let p=0;if(nPathPts<=1){
for(p=0;p<nResampPts;p++){let lo=path[0];
let px=lo.x+p*0.0001;let py=lo.y+p*0.0001;let pz=lo.z+p*0.0001;
resampledPath[p].set(px,py,pz);
}}else{for(let i=0;i<nPathPts-1;i++){
let lo=path[i];let hi=path[i+1];
let Dx=hi.x-lo.x;let Dy=hi.y-lo.y;let Dz=hi.z-lo.z;
let segLen=Math.sqrt(Dx*Dx+Dy*Dy);
let ASL=segLen;let dx=Dx/segLen;let dy=Dy/segLen;
let RSLdx=dx*RSL;let RSLdy=dy*RSL;let needsL=RSL-prevRem;
if(ASL>=needsL){let remainder=ASL;
let px=lo.x+needsL*dx;let py=lo.y+needsL*dy;let pz=lo.z+Dz/2;
if(p<nResampPts){resampledPath[p].set(px,py,pz);
remainder-=needsL;p++;}let nPtsToDo=Math.floor(remainder/RSL);
for(let d=0;d<nPtsToDo;d++){px+=RSLdx;py+=RSLdy;
if(p<nResampPts){resampledPath[p].set(px,py,pz);
remainder-=RSL;p++;}}prevRem=remainder;
}else{prevRem+=ASL;}}}}}

function drawStem(path){
if(fSinceMUp<nFadeFrames){let nSegs=path.length;if(nSegs>1){
let col=Math.max(0,nFadeFrames-fSinceMUp)/nFadeFrames;
let skip=(bAut)?6:1;for(let i=0;i<nSegs;i+=skip){
let c=(i/nSegs)*col;let g=c*c*255;
ctx.fillStyle="rgb("+g+","+g+","+g+")";
ctx.beginPath();ctx.arc(path[i].x,path[i].y,0.5,0.5,tau);
ctx.fill();}}}}

function drawMesh(fromArr,toArr){
let sizef=0.5;let c=0;let spacing=25;
let nbsm1=nBezSamp-1;let nrsm1=nResamp-1;
let roundSamp=Math.round(currSamp);
let splBreath=2.5*Math.sin(myMils()/5000);
for(let i=0;i<nrsm1;i++){
let splNoise=(myNoise(i/nrsm1+myMils()/4000)-0.5);
splStr=10+splNoise+splBreath;
let p1a=fromArr[i];let p1b=fromArr[i+1];
let p4a=toArr[i];let p4b=toArr[i+1];
let p1x=(p1a.x+p1b.x)/2;let p1y=(p1a.y+p1b.y)/2;let p1z=(p1a.z+p1b.z)/2;
let p4x=(p4a.x+p4b.x)/2;let p4y=(p4a.y+p4b.y)/2;let p4z=(p4a.z+p4b.z)/2;
let p2x=p1x+(p1a.y-p1b.y)*splStr;
let p2y=p1y+(p1b.x-p1a.x)*splStr;
let p2z=p1z+(p1b.z-p1a.z)*splStr;
let p3x=p4x-(p4a.y-p4b.y)*splStr;
let p3y=p4y-(p4b.x-p4a.x)*splStr;
let p3z=p4y-(p4b.z-p4a.z)*splStr;
for(let s=0;s<nbsm1;s++){
if(s%spacing==0&&(s+roundSamp+1)%nBezSamp!=0){
let sa=(s+roundSamp)%nBezSamp;let sb=(s+roundSamp+1)%nBezSamp;
let omt3sa=omt3[sa];let bto2sa=bto2[sa];
let bt2osa=bt2o[sa];let bt3sa=bt3[sa];
let omt3sb=omt3[sb];let bto2sb=bto2[sb];
let bt2osb=bt2o[sb];let bt3sb=bt3[sb];
let pax=omt3sa*p1x+bto2sa*p2x+bt2osa*p3x+bt3sa*p4x;
let pay=omt3sa*p1y+bto2sa*p2y+bt2osa*p3y+bt3sa*p4y;
let paz=omt3sa*p1z+bto2sa*p2z+bt2osa*p3z+bt3sa*p4z;
let pbx=omt3sb*p1x+bto2sb*p2x+bt2osb*p3x+bt3sb*p4x;
let pby=omt3sb*p1y+bto2sb*p2y+bt2osb*p3y+bt3sb*p4y;
let pbz=omt3sb*p1z+bto2sb*p2z+bt2osb*p3z+bt3sb*p4z;
sizef=(paz+pbz)*quadDim;
let pbmax=(pbx-pax)*sizef;
let pbmay=(pby-pay)*sizef;
let pamby=(pay-pby)*sizef;
let b1x=pax-pbmax*2;let b1y=pay-pbmay*2;
let b2x=pbx+pbmax*2;let b2y=pby+pbmay*2;
c=(1-Math.cos((sa/nBezSamp)*tau))/2;
ctx.strokeStyle="rgba(255,255,255,"+c+")";
let avx=(pax+pbx)/2;let avy=(pay+pby)/2;
let b4x=avx+pamby;let b4y=avy+pbmax;
let b3x=avx-pamby;let b3y=avy-pbmax;
ctx.beginPath();ctx.moveTo(b1x,b1y);
ctx.lineTo(b3x,b3y);ctx.lineTo(b2x,b2y);
ctx.lineTo(b4x,b4y);ctx.lineTo(b1x,b1y);
ctx.stroke();}}}}

function calcPureBezVec3f(t,p1,p2,p3,p4){
let t2=t*t;let t3=t*t2;let onemt=1-t;
let onemt2=onemt*onemt;let onemt3=onemt*onemt2;
let ptx=onemt3*p1.x+3*t*onemt2*p2.x+3*t2*onemt*p3.x+t3*p4.x;
let pty=onemt3*p1.y+3*t*onemt2*p2.y+3*t2*onemt*p3.y+t3*p4.y;
let ptz=onemt3*p1.z+3*t*onemt2*p2.z+3*t2*onemt*p3.z+t3*p4.z;
let pt=new Vec3f(ptx,pty,ptz);return pt;}

function calculateFeatures(tokDat){
class CFRandom {constructor(){
this.useA=F;let CFsfc32=function(uint128Hex){
let a=parseInt(uint128Hex.substring(0,8),16);
let b=parseInt(uint128Hex.substring(8,16),16);
let c=parseInt(uint128Hex.substring(16,24),16);
let d=parseInt(uint128Hex.substring(24,32),16);
return function(){a|=0;b|=0;c|=0;d|=0;let t=(((a+b)|0)+d)|0;
d=(d+1)|0;a=b^(b>>>9);b=(c+(c<<3))|0;c=(c<<21)|(c>>>11);c=(c+t)|0;
return (t>>>0)/4294967296;};};
this.prngA=new CFsfc32(tokDat.hash.substring(2,34));
this.prngB=new CFsfc32(tokDat.hash.substring(34,66));
for(let i=0;i<1e6;i+=2){this.prngA();this.prngB();}}
cfRandomDec(){this.useA=!this.useA;return this.useA?this.prngA():this.prngB();}}
let myCFRandom=new CFRandom();
function cfR01(){let n=myCFRandom.cfRandomDec();return n=~~(32768*n)/32768,n}
const cfRandPick=(arr)=>arr[(cfR01()*arr.length)|0];
function cfGetOpt(options){let choices=[];for(let i in options){
choices=choices.concat(new Array(options[i][1]).fill(options[i][0]));}return cfRandPick(choices);};
function cfResetRnd(newhash){tokDat.hash=newhash;myCFRandom=new CFRandom();}
cfResetRnd(tokDat.hash);
let sty=cfGetOpt([[0,25],[1,8],[2,2],[3,15],[4,5],[5,15],[6,15],[7,10]]);
return {"Style":sty};}

function genStarterGestures(){
gestA=[];gestB=[];
if(meshyStyle==MWHALE){
let nBezSetsA=getOpt([[1,65],[2,30],[3,5]]);
let nBezSetsB=getOpt([[1,45],[2,30],[3,20],[4,5]]);
let baseA=0.3+0.15*Math.pow(myR01(),0.75);
let baseB=0.7-0.15*Math.pow(myR01(),0.75);
let cPtsA=genBezCtrPtSet(nBezSetsA,baseA);
let cPtsB=genBezCtrPtSet(nBezSetsB,baseB);
gestA=genBezGest(cPtsA,nBezSetsA);
gestB=genBezGest(cPtsB,nBezSetsB);
}else if(meshyStyle==MSCRIB){gestA=genScribGest();gestB=genScribGest();
}else if(meshyStyle==MSTEER){gestA=genSteerGest(-1);gestB=genSteerGest(1);
}else if(meshyStyle==MMIXY1){gestA=genSteerGest();gestB=genScribGest();
}else if(meshyStyle==MMIXY2){let nBezSetsB=2;let baseB=myRAB(0.4,0.6);
let cPtsB=genBezCtrPtSet(nBezSetsB,baseB);
gestB=genBezGest(cPtsB,nBezSetsB);gestA=genScribGest();
}else if(meshyStyle==MWHAL2){
let nBezSetsA=getOpt([[1,5],[2,35],[3,40],[4,20]]);
let baseA=myRAB(0.5,0.6);let cPtsA=genBezCtrPtSet(nBezSetsA,baseA);
gestA=genBezGest(cPtsA,nBezSetsA);gestB=genNearDupGest(gestA);
}else if(meshyStyle==MSRIB2){gestA=genScribGest();gestB=genNearDupGest(gestA);
}else if(meshyStyle==MSTER2){gestA=genSteerGest();gestB=genNearDupGest(gestA);
}recenterGests();}

function recenterGests(){
let mx=0,my=0;
for(let i=0;i<(gestA.length);i++){mx+=gestA[i].x;my+=gestA[i].y;}
for(let i=0;i<(gestB.length);i++){mx+=gestB[i].x;my+=gestB[i].y;}
mx/=(gestA.length+gestB.length);my/=(gestA.length+gestB.length);
let dx=(myW/2-mx),dy=(myH/2-my);
for(let i=0;i<(gestA.length);i++){gestA[i].x+=dx;gestA[i].y+=dy;}
for(let i=0;i<(gestB.length);i++){gestB[i].x+=dx;gestB[i].y+=dy;}}

function genNearDupGest(gIn){
let gOut=[];let rAmp=myW*myRAB(0.618,1.618);
let r1=myRAB(0,rAmp*0.25);let r2=rAmp-r1;
for(let i=0;i<(gIn.length-1);i++){
let px=gIn[i].x,py=gIn[i].y;
let qx=gIn[i+1].x,qy=gIn[i+1].y;
let r=myMap(i,0,gIn.length,r1-(rAmp/2),r2-(rAmp/2));
let dx=qx-px,dy=qy-py;let dh=Math.sqrt(dx*dx+dy*dy);
if(dh>0){let gx=px+r*dy/dh;let gy=py-r*dx/dh;
gx=(gx+px)/2;gy=(gy+(py-r))/2;
gx=myW*myMap(gx/myW,0.1,0.9,-0.1,1.1);
gOut.push(new Vec3f(gx,gy,0));
}}return gOut;}

function genSteerGest(lr){
let gest=[];let nSteerPts=myRInt(40,120);
let cy=myH*myRAB(0.4,0.6);let cx=0.5;
if(lr>0.5){cx=myW*myRAB(0.6,0.75);
}else if(lr<-0.5){cx=myW*myRAB(0.25,0.4);
}else{cx=myW*myRAB(0.4,0.6);}
let px=cx;let py=cy;
let t=myRAB(0,100);let ori=myRAB(0,tau);
let dt=tau*myRAB(0.001,0.013);let dori=myRAB(0.08,0.2);
let speed=myW/nSteerPts;for(let i=0;i<nSteerPts;i++){
ori+=dori*myMap(myNoise(t),0,1,0-tau,tau)/2;
let dx=speed*Math.cos(ori);let dy=speed*Math.sin(ori);
gest.push(new Vec3f(px,py,0));
px+=dx;py+=dy;t+=dt;
}return gest;}

function genScribGest(){
let nTurns=getOpt([[1,35],[2,30],[3,12],[4,10],[5,10],[6,3]]);
let noiSpd=myRAB(0.05,0.5);let gest=[];
let cx=myW*myRAB(0.45,0.55);let cy=myH*myRAB(0.45,0.55);
let toff=myRAB(0,100);let ori=myRAB(0,tau);
let ecc=myRAB(1,1.5);let rMag=myRAB(0.1,0.4);
let rVar=myRAB(0.1,0.9);let sgn=(myR01()<0.1)?-1:1;
let dcx=Math.pow(myR01(),2)*myRAB(0,0.1);
let nScribPts=nTurns*60;
for(let i=0;i<nScribPts;i++){
let t=myMap(i,0,nScribPts,0,sgn*tau*nTurns);
let rn=myNoise(toff-t*noiSpd);let r=myMap(rn,0,1,1-rVar,1);
let rx=myH*r*rMag;let ry=myH*r*rMag*ecc;
let x=rx*Math.cos(t);let y=ry*Math.sin(t);
let ox=cx+myW*myMap(i,0,nScribPts,-dcx,dcx);
let px=ox+x*Math.cos(ori)-y*Math.sin(ori);
let py=cy+x*Math.sin(ori)+y*Math.cos(ori);
gest.push(new Vec3f(px,py,0));
}return gest;}

function genBezCtrPtSet(nBezSets,cy){
let nControlPts=1+nBezSets*3;let cPts=[];
let x0=0.1,x1=0.9;let xp=myRAB(0.5,1);
if(myR01()<0.5){xp=1/xp;}let wig=0.3;
for(let i=0;i<nControlPts;i++){
let t=myMap(i,0,nControlPts-1,0,1);
let tx=Math.pow(t,xp);
let px=myW*myMap(tx,0,1,x0,x1);
let py=myH*cy+myH*myRAB(-wig,wig);
if((i>3)&&(i%3==1)){ 
py=cPts[i-1].y+(cPts[i-1].y-cPts[i-2].y);
}cPts.push(new Vec3f(px,py,0));
}return cPts;}

function genBezGest(cPts,nBezSets){
let gestPts=[];let nPoints=60/nBezSets;
for(let j=0;j<nBezSets;j++){for(let i=0;i<nPoints;i++){
let t=i/(nPoints-0),n=j*3;
let p=calcPureBezVec3f(t,cPts[n],cPts[n+1],cPts[n+2],cPts[n+3]);
gestPts.push(p);}}return gestPts;}

class Vec3f{
constructor(inx,iny,inz){
if(inx===undefined){this.set(0,0,0);
}else{this.set(inx,iny,inz);}}
set(inx,iny,inz){this.x=inx;this.y=iny;this.z=inz;}}

function myMap(val,a1,b1,a2,b2){
return a2+(b2-a2)*((val-a1)/(b1-a1));}

function myMils(){return Date.now()-appStartT;}

function myNoise(x){
const freqArr=[7,17,31,67,109];
const phasArr=[0.3,0.7,1.1,1.7,2.3];
let val=0,amp=0.5;for(let i=0;i<freqArr.length;i++){
let freq=freqArr[i]*0.2;let phas=phasArr[i];
val+=amp*Math.sin(phas+freq*x);amp*=0.5;}return (1+val)/2;}

class Random{
constructor(){this.useA=F;let sfc32=function(uint128Hex){
let a=parseInt(uint128Hex.substring(0,8),16);
let b=parseInt(uint128Hex.substring(8,16),16);
let c=parseInt(uint128Hex.substring(16,24),16);
let d=parseInt(uint128Hex.substring(24,32),16);
return function(){a|=0;b|=0;c|=0;d|=0;let t=(((a+b)|0)+d)|0;
d=(d+1)|0;a=b^(b>>>9);b=(c+(c<<3))|0;c=(c<<21)|(c>>>11);c=(c+t)|0;
return (t>>>0)/4294967296;};};
this.prngA=new sfc32(tokenData.hash.substring(2,34));
this.prngB=new sfc32(tokenData.hash.substring(34,66));
for(let i=0;i<1e6;i+=2){this.prngA();this.prngB();}}
random_dec(){this.useA = !this.useA;return this.useA?this.prngA():this.prngB();}
random_num(a,b){return a+(b-a)*this.random_dec();}
random_int(a,b){return Math.floor(this.random_num(a,b+1));}
random_bool(p){return this.random_dec()<p;}
random_choice(list){return list[this.random_int(0,list.length-1)];}}

function myRandomReset(newhash){
tokenData.hash=newhash?newhash:CHASH; 
myABRandom=new Random();}

function myR01(){let r=myABRandom.random_dec();r=~~(r*32768)/32768;return r;}
function myRA(a){return (a*myR01());}
function myRAB(a,b){return a+((b-a)*myR01());}
function myRInt(a,b){return Math.floor(myRAB(a,b+1));}
const randPick=(arr)=>arr[(myR01()*arr.length)|0];
const getOpt=function(options){let choices=[];for(let i in options){
choices=choices.concat(new Array(options[i][1]).fill(options[i][0]));
}return randPick(choices);};

document.addEventListener('DOMContentLoaded',function(){setup();});