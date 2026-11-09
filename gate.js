/* AATCC passcode gate: casual access gate only (static site), stores a salted SHA-256 hash, never the passcode */
(function(){var H="acb83ee7b673d974da758a161286f631a2aa056f87f0a2836b282dd664369b89",S="aatcc-gate-v1:",K="aatccGate";
try{if(localStorage.getItem(K)===H)return;}catch(e){}
var open=true;
window.addEventListener("keydown",function(e){if(open&&e.target&&e.target.id==="aatccGateIn")e.stopImmediatePropagation();},true);
window.addEventListener("keyup",function(e){if(open&&e.target&&e.target.id==="aatccGateIn")e.stopImmediatePropagation();},true);
function hex(b){return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0");}).join("");}
function build(){var d=document.createElement("div");d.id="aatccGate";
d.setAttribute("style","position:fixed;inset:0;z-index:2147483647;background:#0b0d0b;display:flex;align-items:center;justify-content:center;font-family:monospace;color:rgb(120,255,140)");
d.innerHTML="<form id=\"aatccGateF\" style=\"text-align:center;border:1px solid rgb(120,255,140);padding:28px 24px;max-width:340px;width:90%\"><h2 style=\"margin:0 0 6px\">AATCC Training Simulation</h2><div style=\"opacity:.75;font-size:13px;margin-bottom:16px\">Enter the passcode to continue</div><input id=\"aatccGateIn\" type=\"password\" autocomplete=\"current-password\" style=\"width:100%;box-sizing:border-box;padding:10px;font:16px monospace;background:#030503;color:rgb(160,255,175);border:1px solid rgb(120,255,140);outline:none\"><button type=\"submit\" style=\"margin-top:12px;width:100%;padding:10px;font:bold 15px monospace;background:#123f1a;color:rgb(160,255,175);border:1px solid rgb(120,255,140);cursor:pointer\">Enter</button><div id=\"aatccGateMsg\" style=\"min-height:18px;margin-top:10px;color:#ff6a6a;font-size:13px\"></div></form>";
document.body.appendChild(d);var i=document.getElementById("aatccGateIn");setTimeout(function(){i.focus({preventScroll:true});},50);
document.getElementById("aatccGateF").addEventListener("submit",function(e){e.preventDefault();e.stopPropagation();
crypto.subtle.digest("SHA-256",new TextEncoder().encode(S+i.value.trim())).then(function(b){
if(hex(b)===H){try{localStorage.setItem(K,H);}catch(x){}open=false;d.remove();}
else{document.getElementById("aatccGateMsg").textContent="Incorrect passcode";i.value="";i.focus({preventScroll:true});}});});}
if(document.body)build();else document.addEventListener("DOMContentLoaded",build);})();
