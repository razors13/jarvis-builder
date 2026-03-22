(function(){
  const DARK = {
    '--bg':'#0a0a0a','--bg2':'#111111','--bg3':'#1a1a1a','--bg4':'#222222',
    '--border':'#2a2a2a','--text':'#e0e0e0','--text-dim':'#888888',
    '--purple-glow':'rgba(127,119,221,0.15)'
  };
  const LIGHT = {
    '--bg':'#f4f4f6','--bg2':'#ffffff','--bg3':'#ebebed','--bg4':'#e0e0e2',
    '--border':'#d0d0d4','--text':'#1a1a1a','--text-dim':'#666666',
    '--purple-glow':'rgba(127,119,221,0.08)'
  };
  function applyTheme(dark){
    const vars = dark ? DARK : LIGHT;
    const r = document.documentElement;
    for(const [k,v] of Object.entries(vars)) r.style.setProperty(k,v);
    document.querySelectorAll('#theme-toggle').forEach(btn => {
      btn.textContent = dark ? '☀️' : '🌙';
    });
    localStorage.setItem('jarvis-theme', dark ? 'dark' : 'light');
  }
  window.toggleTheme = function(){
    const isDark = localStorage.getItem('jarvis-theme') !== 'light';
    applyTheme(!isDark);
  };
  document.addEventListener('DOMContentLoaded', function(){
    applyTheme(localStorage.getItem('jarvis-theme') !== 'light');
  });
})();