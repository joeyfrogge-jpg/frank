/* frankgpt loader */
(function(){
  var parts=["frank-part0.js","frank-part1.js","frank-part2.js"];
  var code="", i=0;
  function next(){
    if(i>=parts.length){
      var s=document.createElement("script");
      s.text=code;
      document.head.appendChild(s);
      return;
    }
    fetch(parts[i]+"?v=21").then(function(r){return r.text()}).then(function(t){
      code+=t; i++; next();
    }).catch(function(e){console.error(e);alert("Failed to load FrankGPT");});
  }
  next();
})();
