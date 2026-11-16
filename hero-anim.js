/* LawDB hero animation: "search signals" — pulses rise from American cities and connect to nearby firm dots */
(function(){
  var C=[["New York",-74.0,40.71,9],["Los Angeles",-118.24,34.05,8],["Chicago",-87.63,41.88,6],["Houston",-95.37,29.76,6],["Miami",-80.19,25.77,7],["Atlanta",-84.39,33.75,5],["Dallas",-96.8,32.78,5],["Washington",-77.04,38.9,5],["Philadelphia",-75.17,39.95,4],["Boston",-71.06,42.36,4],["Phoenix",-112.07,33.45,4],["Seattle",-122.33,47.61,4],["San Francisco",-122.42,37.77,4],["Denver",-104.99,39.74,3],["Tampa",-82.46,27.95,5],["Orlando",-81.38,28.54,5],["Minneapolis",-93.27,44.98,3],["Detroit",-83.05,42.33,3],["San Diego",-117.16,32.72,3],["Las Vegas",-115.14,36.17,3],["Charlotte",-80.84,35.23,3],["Nashville",-86.78,36.16,3],["New Orleans",-90.07,29.95,3],["Jacksonville",-81.66,30.33,3]];
  function seeded(n){return function(){n=(n*16807)%2147483647;return (n-1)/2147483646}}
  function init(hero){
    var cv=document.createElement('canvas'); cv.className='hero-canvas'; cv.setAttribute('aria-hidden','true');
    hero.insertBefore(cv,hero.firstChild);
    var x=cv.getContext('2d'), dpr=Math.min(window.devicePixelRatio||1,2), W=0,H=0, dots=[], cities=[], pulses=[], links=[];
    var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    var visible=true, raf=0, last=0, nextPulse=0;
    function proj(lon,lat){
      var wide=W>800, span=wide?62:24, cLon=wide?-96:-82, cLat=wide?38:30;
      var s=W/span, k=Math.cos(47*Math.PI/180);
      return [W/2+(lon-cLon)*s*k*1.25, H/2-(lat-cLat)*s*1.25*1.0];
    }
    function build(){
      var r=seeded(7); dots=[]; cities=[];
      C.forEach(function(c){
        var p=proj(c[1],c[2]); cities.push({n:c[0],x:p[0],y:p[1],w:c[3]});
        var n=Math.round(c[3]*(W>800?7:5));
        for(var i=0;i<n;i++){var a=r()*6.283,d=Math.pow(r(),.7)*(18+c[3]*5);dots.push({x:p[0]+Math.cos(a)*d,y:p[1]+Math.sin(a)*d*.75,r:.9+r()*1.2,glow:0,city:c[0]})}
      });
    }
    function size(){
      var b=hero.getBoundingClientRect(); W=b.width; H=b.height;
      cv.width=W*dpr; cv.height=H*dpr; x.setTransform(dpr,0,0,dpr,0,0); build();
      if(reduce||!visible) draw(0);
    }
    function pulse(){
      var tot=0,i; cities.forEach(function(c){tot+=c.w}); var t=Math.random()*tot,c;
      for(i=0;i<cities.length;i++){t-=cities[i].w; if(t<=0){c=cities[i];break}} c=c||cities[0];
      pulses.push({x:c.x,y:c.y,t:0});
      var near=dots.filter(function(d){return d.city===c.n}).sort(function(){return Math.random()-.5}).slice(0,3);
      near.forEach(function(d){links.push({x1:c.x,y1:c.y,d:d,t:-0.15})});
    }
    function draw(dt){
      x.clearRect(0,0,W,H);
      var i,d,p,l;
      for(i=0;i<dots.length;i++){d=dots[i]; d.glow=Math.max(0,d.glow-dt*.5);
        x.beginPath(); x.arc(d.x,d.y,d.r*1.15+d.glow*2.6,0,6.283);
        x.fillStyle=d.glow>0.02?'rgba(232,169,31,'+(.35+d.glow*.65)+')':'rgba(245,243,236,0.42)'; x.fill();
      }
      for(i=pulses.length-1;i>=0;i--){p=pulses[i]; p.t+=dt*.45; if(p.t>=1){pulses.splice(i,1);continue}
        var rad=p.t*130, a=(1-p.t)*.6;
        x.beginPath(); x.arc(p.x,p.y,rad,0,6.283); x.strokeStyle='rgba(232,169,31,'+a+')'; x.lineWidth=1.6; x.stroke();
        x.beginPath(); x.arc(p.x,p.y,3+ (1-p.t)*2,0,6.283); x.fillStyle='rgba(232,169,31,'+(1-p.t)+')'; x.fill();
      }
      for(i=links.length-1;i>=0;i--){l=links[i]; l.t+=dt*.9; if(l.t>=1){links.splice(i,1);continue}
        if(l.t<0)continue; var e=Math.min(1,l.t*3), a2=(1-l.t)*.75;
        x.beginPath(); x.moveTo(l.x1,l.y1); x.lineTo(l.x1+(l.d.x-l.x1)*e,l.y1+(l.d.y-l.y1)*e);
        x.strokeStyle='rgba(232,169,31,'+a2*.7+')'; x.lineWidth=1; x.stroke();
        if(e>=1) l.d.glow=Math.max(l.d.glow,a2);
      }
    }
    function frame(ts){
      raf=0; if(!visible||document.hidden) return;
      var dt=Math.min(.05,(ts-(last||ts))/1000); last=ts;
      nextPulse-=dt; if(nextPulse<=0){pulse(); nextPulse=.3+Math.random()*.45}
      draw(dt); raf=requestAnimationFrame(frame);
    }
    function start(){ if(reduce||raf) return; last=0; raf=requestAnimationFrame(frame); }
    size();
    if(reduce){ for(var k=0;k<4;k++)pulse(); links.forEach(function(l){l.t=.3;l.d.glow=.6}); pulses.forEach(function(p){p.t=.35}); draw(0); }
    window.addEventListener('resize',function(){size()});
    if('IntersectionObserver' in window) new IntersectionObserver(function(es){visible=es[0].isIntersecting; if(visible)start();}).observe(hero);
    document.addEventListener('visibilitychange',function(){ if(!document.hidden)start(); });
    start();
  }
  document.addEventListener('DOMContentLoaded',function(){ var h=document.querySelector('.hero.hero-anim'); if(h) init(h); });
})();
