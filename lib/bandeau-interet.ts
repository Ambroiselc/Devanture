// Bandeau « Ce site m'intéresse » en haut des maquettes publiques /m/<slug> (13/11, demande de Broise) : 17 artisans
// avaient ouvert leur maquette sans qu'aucun ne réponde. Ici, un clic suffit pour se manifester (numéro facultatif) ;
// la demande part vers /m/<slug>/interet → public.maquette_interet → table maquette_interets → alerte à Broise.
// Collé en haut de l'écran (position: sticky) pour rester visible pendant qu'on fait défiler la maquette.
// En aperçu (Broise connecté ou ?apercu=1), le bandeau s'affiche mais rien n'est envoyé.

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function bandeauInteret(slug: string, style: string, apercu: boolean): string {
  const url = JSON.stringify(`/m/${slug}/interet`);
  const st = JSON.stringify(echapper(style));
  return `<div id="dv-interet" style="position:sticky;top:0;z-index:60;background:#FFF4CC;color:#1a1a1a;border-bottom:1px solid #E8D48A;box-shadow:0 2px 8px rgba(0,0,0,.08);font:15px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif">
<div id="dv-i-1" style="max-width:68rem;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 14px;padding:10px 16px;text-align:center">
<span style="font-weight:600">Ce site pourrait être le vôtre.</span>
<button type="button" id="dv-i-oui" style="font:inherit;font-weight:700;background:#111;color:#fff;border:0;border-radius:999px;padding:9px 18px;cursor:pointer">Oui, ça m'intéresse</button>
</div>
<form id="dv-i-2" style="display:none;max-width:34rem;margin:0 auto;padding:12px 16px 14px;background:#FFF4CC;border:0;box-shadow:none;border-radius:0;gap:0" novalidate>
<p style="margin:0 0 8px;font-weight:600">Parfait. Laissez votre numéro si vous voulez que je vous rappelle (facultatif) :</p>
<div style="display:flex;flex-wrap:wrap;gap:8px">
<input id="dv-i-tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="06 12 34 56 78" style="flex:1 1 11rem;min-width:0;font:inherit;padding:9px 12px;border:1px solid #c9b46a;border-radius:8px;background:#fff">
<button type="submit" id="dv-i-envoi" style="font:inherit;font-weight:700;background:#111;color:#fff;border:0;border-radius:8px;padding:9px 18px;cursor:pointer">Envoyer</button>
</div>
<input id="dv-i-msg" type="text" maxlength="300" placeholder="Un mot, une question ? (facultatif)" style="margin-top:8px;width:100%;box-sizing:border-box;font:inherit;padding:9px 12px;border:1px solid #c9b46a;border-radius:8px;background:#fff">
<p style="margin:8px 0 0;font-size:12px;color:#555">Sans engagement. Votre numéro sert seulement à vous recontacter au sujet de ce site.</p>
</form>
<p id="dv-i-3" style="display:none;margin:0;padding:12px 16px;text-align:center;font-weight:600"></p>
</div>
<script>(function(){var d=document,un=d.getElementById("dv-i-1"),f=d.getElementById("dv-i-2"),fin=d.getElementById("dv-i-3");
d.getElementById("dv-i-oui").addEventListener("click",function(){un.style.display="none";f.style.display="block";try{d.getElementById("dv-i-tel").focus()}catch(e){}});
f.addEventListener("submit",function(ev){ev.preventDefault();var b=d.getElementById("dv-i-envoi");b.disabled=true;b.textContent="Envoi…";
${apercu
    ? `f.style.display="none";fin.style.display="block";fin.textContent="Aperçu : rien n'a été envoyé.";`
    : `var corps=JSON.stringify({t:d.getElementById("dv-i-tel").value,m:d.getElementById("dv-i-msg").value,s:${st},a:/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)?"telephone":"ordinateur"});
fetch(${url},{method:"POST",headers:{"content-type":"text/plain"},body:corps}).then(function(r){return r.ok?r.json():{ok:false}}).catch(function(){return{ok:false}}).then(function(r){
f.style.display="none";fin.style.display="block";fin.textContent=r&&r.ok?"Merci, c'est noté ! Je vous recontacte très vite. Ambroise":"Ça n'a pas marché. Répondez simplement à l'e-mail reçu et je vous recontacte."});`}
})})();</script>`;
}
