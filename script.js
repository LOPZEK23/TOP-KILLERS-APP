document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const STORAGE_KEY = "esports_tournament_data_v2";
  const IMAGE_DB = "esports_tournament_images";
  const IMAGE_STORE = "images";
  const OLD_TEAMS_KEY = "torneo_equipos";
  const OLD_RESULTS_KEY = "torneo_resultados";
  const $ = (id) => document.getElementById(id);
  const state = { teams: [], matches: [], selectedWeek: "", rankingMode: "weekly", images: new Map() };

  let supabaseReady = false;

  const ADMIN_UID = "6754d19a-05f7-42a7-b539-1176e3a522f8";

async function verificarSesion() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        console.error("Error verificando sesión:", error);
        return;
    }

    const session = data.session;

    if (!session) {
        $("loginScreen").hidden = false;
        $("appShell").hidden = true;
        supabaseReady = false;
        return;
    }

    if (session.user.id !== ADMIN_UID) {
        await supabaseClient.auth.signOut();
        $("loginScreen").hidden = false;
        $("appShell").hidden = true;
        $("loginError").textContent = "No tienes permiso para acceder.";
        supabaseReady = false;
        return;
    }

    $("loginScreen").hidden = true;
    $("appShell").hidden = false;

    supabaseReady = false;

    await cargarEquiposSupabase();
    await cargarPartidasSupabase();
}

$("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    $("loginError").textContent = "Verificando acceso...";

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
    console.error("Error de inicio de sesión:", error);
    $("loginError").textContent = error.message;
    return;
}

    if (data.user.id !== ADMIN_UID) {
        await supabaseClient.auth.signOut();
        $("loginError").textContent = "Esta cuenta no tiene permiso de administrador.";
        return;
    }

    $("loginError").textContent = "";
    $("loginScreen").hidden = true;
    $("appShell").hidden = false;

    supabaseReady = false;

        await cargarEquiposSupabase();
        await cargarPartidasSupabase();
});

async function cargarEquiposSupabase() {
    let todosLosEquipos = [];
    let desde = 0;
    const limite = 1000;

    try {
        while (true) {
            const { data, error } = await supabaseClient
                .from("teams")
                .select(`
                    id,
                    tag,
                    name,
                    logo_url,
                    players (
                        id,
                        nickname,
                        game_id,
                        photo_url
                    )
                `)
                .order("created_at", { ascending: true })
                .order("id", { ascending: true })
                .range(desde, desde + limite - 1);

            if (error) throw error;

            todosLosEquipos = todosLosEquipos.concat(data || []);

            if (!data || data.length < limite) {
                break;
            }

            desde += limite;
        }

        state.teams = todosLosEquipos.map(team => ({
            id: team.id,
            tag: team.tag,
            name: team.name,
            logoId: team.logo_url || "",
            players: (team.players || []).map(player => ({
                id: player.id,
                name: player.nickname,
                gameId: player.game_id || "",
                photoId: player.photo_url || ""
            }))
        }));

        renderAll();
        supabaseReady = true;

        console.log(
            "Equipos cargados correctamente:",
            state.teams.length
        );

    } catch (error) {
        console.error("Error cargando equipos:", error);
        showToast("No se pudieron cargar todos los equipos.");
    }
}

async function cargarPartidasSupabase() {
    let todasLasPartidas = [];
    let desde = 0;
    const limite = 1000;

    try {
        while (true) {
            const { data, error } = await supabaseClient
                .from("matches")
                .select(`
                    id,
                    match_date,
                    match_number,
                    team_id,
                    teams (
                        name,
                        tag
                    ),
                    player_kills (
                        player_id,
                        kills,
                        players (
                            nickname
                        )
                    )
                `)
                .order("match_date", { ascending: false })
                .order("match_number", { ascending: true })
                .order("id", { ascending: true })
                .range(desde, desde + limite - 1);

            if (error) throw error;

            todasLasPartidas = todasLasPartidas.concat(data || []);

            if (!data || data.length < limite) {
                break;
            }

            desde += limite;
        }

        state.matches = todasLasPartidas.map(match => ({
            id: match.id,
            teamId: match.team_id,
            teamName: match.teams?.name || "",
            teamTag: match.teams?.tag || "",
            date: match.match_date,
            weekId: weekId(match.match_date),
            matchNumber: match.match_number,
            players: (match.player_kills || []).map(item => ({
                id: item.player_id,
                name: item.players?.nickname || "",
                kills: item.kills
            }))
        }));

        state.selectedWeek = currentWeek();

        renderAll();

        console.log(
            "Partidas cargadas correctamente:",
            state.matches.length
        );

    } catch (error) {
        console.error("Error cargando partidas:", error);
        showToast("No se pudieron cargar todas las partidas.");
    }
} 

  const dayNames = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  let imageDb;

  function uid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function parseDate(value) {
    const [y,m,d] = value.split("-").map(Number);
    return new Date(y,m-1,d,12);
  }

  function dateString(date) {
    const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }

  function mondayOf(value) {
    const d=parseDate(value);
    d.setDate(d.getDate()-((d.getDay()+6)%7));
    return dateString(d);
  }

  function saturdayOf(monday) {
    const d=parseDate(monday);
    d.setDate(d.getDate()+5);
    return dateString(d);
  }

  function weekId(value) { return mondayOf(value); }

  function weekLabel(id) {
    return id ? `${formatDate(id)} – ${formatDate(saturdayOf(id))}` : "Semana";
  }

  function formatDate(value) {
    return value ? parseDate(value).toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"}) : "—";
  }

  function dayNumber(value) { return parseDate(value).getDay(); }

  function normalizeTag(tag) {
    const clean=String(tag||"").trim().replace(/[\[\]]/g,"");
    return clean ? `[${clean.toUpperCase()}]` : "";
  }

  function playerName(p) {
    return typeof p === "string" ? p : (p?.name || p?.nickname || "Jugador");
  }

  function playerId(p) {
    return typeof p === "string" ? p : (p?.id || p?.name || p?.nickname || "");
  }

  function totalMatch(match) {
    return (match.players||[]).reduce((sum,p)=>sum+Number(p.kills||0),0);
  }

  function showToast(message) {
    const el=$("toast");
    el.textContent=message;
    el.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer=setTimeout(()=>el.classList.remove("show"),3000);
  }

  function openImageDb() {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(IMAGE_DB,1);
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains(IMAGE_STORE)) {
          request.result.createObjectStore(IMAGE_STORE,{keyPath:"id"});
        }
      };
      request.onsuccess=()=>{
        imageDb=request.result;
        resolve(imageDb);
      };
      request.onerror=()=>reject(request.error);
    });
  }

  function imageTransaction(mode, action, value) {
    return new Promise((resolve,reject)=>{
      const tx=imageDb.transaction(IMAGE_STORE,mode);
      const store=tx.objectStore(IMAGE_STORE);
      const req=store[action](value);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function loadImages() {
    const all=await imageTransaction("readonly","getAll");
    state.images=new Map((all||[]).map(item=>[item.id,item.dataUrl]));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function storeImage(file) {
    if (!file) return "";

    if (!file.type.startsWith("image/")) {
        throw new Error("El archivo seleccionado no es una imagen.");
    }

    if (file.size > 5 * 1024 * 1024) {
        throw new Error("Cada imagen debe pesar máximo 5 MB.");
    }

    const extension = file.name.split(".").pop().toLowerCase();
    const fileName = `${uid()}.${extension}`;
    const filePath = `tournament/${fileName}`;

    const { error } = await supabaseClient.storage
        .from("tournament-images")
        .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false
        });

    if (error) {
        console.error("Error subiendo imagen:", error);
        throw new Error("No se pudo subir la imagen a Supabase.");
    }

    const { data } = supabaseClient.storage
        .from("tournament-images")
        .getPublicUrl(filePath);

    return data.publicUrl;
}

  function imageMarkup(imageValue, className, alt) {
  const src = imageValue
    ? (String(imageValue).startsWith("http")
        ? imageValue
        : state.images.get(imageValue))
    : "";

  return src
    ? `<img class="${className}" src="${escapeHTML(src)}" alt="${escapeHTML(alt)}">`
    : `<span class="image-placeholder">Sin imagen</span>`;
}

  function save() {
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      version:3,
      teams:state.teams,
      matches:state.matches
    }));
  }

  function normalizePlayer(p) {
    if(typeof p==="string") {
      return {id:uid(),name:p,gameId:"",photoId:""};
    }

    return {
      id:p.id||uid(),
      name:p.name||p.nickname||"Jugador",
      gameId:p.gameId||p.game_id||"",
      photoId:p.photoId||p.photo_id||""
    };
  }

  function load() {
    try {
      const raw=localStorage.getItem(STORAGE_KEY);

      if(raw) {
        const data=JSON.parse(raw);

        state.teams=Array.isArray(data.teams)
          ? data.teams.map(t=>({
              ...t,
              players:(t.players||[]).map(normalizePlayer),
              logoId:t.logoId||t.logo_id||""
            }))
          : [];

        state.matches=Array.isArray(data.matches)?data.matches:[];
      } else {
        migrateLegacy();
      }
    } catch(err) {
      console.error(err);
      state.teams=[];
      state.matches=[];
      showToast("No se pudieron leer los datos guardados.");
    }
  }

  function migrateLegacy() {
    try {
      const oldTeams=JSON.parse(localStorage.getItem(OLD_TEAMS_KEY)||"[]");
      const oldResults=JSON.parse(localStorage.getItem(OLD_RESULTS_KEY)||"[]");

      state.teams=(Array.isArray(oldTeams)?oldTeams:[]).map(t=>({
        id:uid(),
        tag:normalizeTag(t.tag),
        name:t.nombre||"Equipo",
        logoId:"",
        players:(t.jugadores||[]).slice(0,8).map(normalizePlayer)
      }));

      (Array.isArray(oldResults)?oldResults:[]).forEach(r=>{
        const team=state.teams.find(t=>t.name===r.equipo);
        if(!team) return;

        const players=Object.entries(r.killsPorJugador||{}).map(([name,kills])=>({
          name,
          kills:Number(kills)||0
        }));

        state.matches.push({
          id:uid(),
          teamId:team.id,
          teamName:team.name,
          teamTag:team.tag,
          date:"",
          weekId:"",
          matchNumber:1,
          players,
          legacy:true
        });
      });

      if(state.teams.length||state.matches.length) {
        save();
        showToast("Se importaron los equipos anteriores. Revisa los registros históricos.");
      }
    } catch(e) {
      console.warn("No se pudo migrar la información anterior",e);
    }
  }

  function allWeeks() {
    const weeks=[...new Set(state.matches.filter(m=>m.weekId).map(m=>m.weekId))];
    const current=weekId(dateString(new Date()));

    if(!weeks.includes(current)) weeks.push(current);

    return weeks.sort((a,b)=>b.localeCompare(a));
  }

  function currentWeek() {
    return weekId(dateString(new Date()));
  }

  function selectedWeekMatches() {
    return state.matches.filter(m=>m.weekId===state.selectedWeek);
  }

  function aggregates(matches) {
    const players=new Map();
    const teams=new Map();

    matches.forEach(m=>{
      const team=state.teams.find(t=>t.id===m.teamId);
      const teamName=team?.name||m.teamName||"Equipo eliminado";
      const tag=team?.tag||m.teamTag||"";

      if(!teams.has(m.teamId)) {
        teams.set(m.teamId,{
        teamId:m.teamId,
        name:teamName,
        tag,
        logoId:team?.logoId || "",
        kills:0,
        matches:0
      });
      }

      const ta=teams.get(m.teamId);
      ta.kills+=totalMatch(m);
      ta.matches++;

      (m.players||[]).forEach(p=>{
        const name=playerName(p);
        const key=`${m.teamId}::${playerId(p)}`;

        if(!players.has(key)) {
          const currentPlayer=team?.players?.find(x=>
            playerId(x)===playerId(p)||playerName(x)===name
          );

          players.set(key,{
            id:playerId(p),
            name,
            photoId:currentPlayer?.photoId||"",
            team:teamName,
            tag,
            kills:0,
            matches:0
          });
        }

        const item=players.get(key);
        item.kills+=Number(p.kills)||0;
        item.matches++;
      });
    });

    return {
      players:[...players.values()].sort((a,b)=>b.kills-a.kills||a.name.localeCompare(b.name)),
      teams:[...teams.values()].sort((a,b)=>b.kills-a.kills||a.name.localeCompare(b.name))
    };
  }

  function emptyRow(cols,message="No hay registros para mostrar.") {
    return `<tr><td colspan="${cols}" class="empty-row">${escapeHTML(message)}</td></tr>`;
  }

  function renderRankRows(target,data,type) {
    const el = $(target);

    if (!data.length) {
        el.innerHTML = emptyRow(type === "players" ? 5 : 4);
        return;
    }

    const isOfficialRanking =
        target === "rankingMvp" ||
        target === "rankingTeams";

      // PODIO DE EQUIPOS

if (type === "teams" && isOfficialRanking) {

    const podiumOrder = [
        data[1],
        data[0],
        data[2]
    ].filter(Boolean);

    const podium = podiumOrder.map(item => {
        const position = data.indexOf(item) + 1;

        return `
            <div class="team-podium-place place-${position}">

                <div class="team-podium-logo">
                    ${imageMarkup(
                        item.logoId,
                        "ranking-team-logo",
                        "Logo de " + item.name
                    )}
                </div>

                <span class="team-podium-medal">
                    ${position === 1 ? "🥇" : position === 2 ? "🥈" : "🥉"}
                </span>

                <b>${escapeHTML(item.name)}</b>

                <span class="team-podium-kills">
                    ${item.kills} KILLS
                </span>

                <strong>#${position}</strong>

            </div>
        `;
    }).join("");

    const others = data.slice(3).map((item, i) => `
        <div class="team-ranking-row">

            <span class="rank-number">#${i + 4}</span>

            ${imageMarkup(
                item.logoId,
                "ranking-team-logo",
                "Logo de " + item.name
            )}

            <b>${escapeHTML(item.name)}</b>

            <span class="kill-number">${item.kills}</span>

        </div>
    `).join("");

    el.innerHTML = `
        <tr>
            <td colspan="4">
                <div class="team-podium">
                    ${podium}
                </div>

                ${others ? `
                    <div class="team-ranking-others">
                        ${others}
                    </div>
                ` : ""}
            </td>
        </tr>
    `;

    return;
}

    el.innerHTML = data.map((item,i) => {

        if (type === "players") {

            if (isOfficialRanking) {
                return `
                    <tr>
                        <td>
                            <span class="rank-number">#${i+1}</span>
                        </td>

                        <td>
                            ${imageMarkup(
                                item.photoId,
                                "ranking-avatar",
                                "Foto de " + item.name
                            )}
                        </td>

                        <td>
                            <b>${escapeHTML(item.name)}</b>
                        </td>

                        <td>
                            <b>${escapeHTML(item.team)}</b>
                        </td>

                        <td>
                            <span class="kill-number">${item.kills}</span>
                        </td>
                    </tr>
                `;
            }

            return `
                <tr>
                    <td><span class="rank-number">#${i+1}</span></td>
                    <td><b>${escapeHTML(item.name)}</b></td>
                    <td>${escapeHTML(item.team)}</td>
                    <td><span class="kill-number">${item.kills}</span></td>
                </tr>
            `;

        } else {

            if (isOfficialRanking) {
                return `
                    <tr>
                        <td>
                            <span class="rank-number">#${i+1}</span>
                        </td>

                        <td>
                            ${imageMarkup(
                                item.logoId,
                                "ranking-team-logo",
                                "Logo de " + item.name
                            )}
                        </td>

                        <td>
                            <b>${escapeHTML(item.name)}</b>
                        </td>

                        <td>
                            <span class="kill-number">${item.kills}</span>
                        </td>
                    </tr>
                `;
            }

            return `
                <tr>
                    <td><span class="rank-number">#${i+1}</span></td>
                    <td><b>${escapeHTML(item.name)}</b></td>
                    <td><span class="tag-text">${escapeHTML(item.tag)}</span></td>
                    <td><span class="kill-number">${item.kills}</span></td>
                </tr>
            `;
        }

    }).join("");
}

  function renderDashboard() {
    const matches=selectedWeekMatches();
    const agg=aggregates(matches);

    $("dashboardWeekLabel").textContent=weekLabel(state.selectedWeek);
    $("statKills").textContent=agg.teams.reduce((s,t)=>s+t.kills,0).toLocaleString("es-CO");
    $("statMatches").textContent=`${matches.length} partidas registradas`;
    $("statTeams").textContent=state.teams.length;
    $("statPlayers").textContent=agg.players.filter(p=>p.kills>0).length;
    $("statMatchCount").textContent=matches.length;

    renderRankRows("dashboardMvp",agg.players.slice(0,10),"players");
    renderRankRows("dashboardTeams",agg.teams.slice(0,10),"teams");

    const recent=[...matches]
      .sort((a,b)=>(b.date||"").localeCompare(a.date||"")||b.matchNumber-a.matchNumber)
      .slice(0,6);

    $("recentMatches").innerHTML=recent.length
      ? recent.map(m=>`<tr>
          <td>${m.date?formatDate(m.date):"Histórico anterior"}</td>
          <td>${m.date?dayNames[dayNumber(m.date)]:"—"}</td>
          <td>Partida ${m.matchNumber||1}</td>
          <td><span class="tag-text">${escapeHTML(m.teamTag||"")}</span> ${escapeHTML(m.teamName||"")}</td>
          <td><span class="kill-number">${totalMatch(m)}</span></td>
        </tr>`).join("")
      : emptyRow(5);
  }

 function renderTeams() {
    $("teamCount").textContent = `${state.teams.length} equipos`;

    $("rosterList").innerHTML = state.teams.length
        ? state.teams.map(t => `
            <details class="roster-card">

                <summary class="roster-card-head">

                    ${imageMarkup(t.logoId, "team-logo", `Logo ${t.name}`)}

                    <div class="roster-team-info">
                        <span class="roster-tag">${escapeHTML(t.tag)}</span>
                        <h4>${escapeHTML(t.name)}</h4>
                        <p>${t.players.length} jugadores registrados</p>
                    </div>

                    <span class="roster-toggle">
                        VER ROSTER ▼
                    </span>

                </summary>

                <div class="roster-players">
                    ${t.players.map(p => `
                        <div class="roster-player-chip">

                            ${imageMarkup(p.photoId, "player-avatar", `Foto de ${p.name}`)}

                            <div>
                                <b>${escapeHTML(p.name)}</b>
                                ${p.gameId ? `<small>ID: ${escapeHTML(p.gameId)}</small>` : ""}
                            </div>

                            <button
                                type="button"
                                class="small-action delete"
                                data-delete-player="${escapeHTML(p.id)}"
                                title="Eliminar jugador">
                                Eliminar
                            </button>

                        </div>
                    `).join("")}
                </div>

                <div class="action-group">

                    <button
                        type="button"
                        class="small-action"
                        data-edit-team="${escapeHTML(t.id)}">
                        Editar equipo
                    </button>

                    <button
                        type="button"
                        class="small-action delete"
                        data-delete-team="${escapeHTML(t.id)}">
                        Eliminar equipo
                    </button>

                </div>

            </details>
        `).join("")
        : `<div class="empty-state">Todavía no hay equipos inscritos. Registra el primero desde este formulario.</div>`;

    const opts = state.teams.map(t =>
        `<option value="${escapeHTML(t.id)}">${escapeHTML(t.tag)} · ${escapeHTML(t.name)}</option>`
    ).join("");

    $("matchTeam").innerHTML =
        `<option value="">Selecciona un equipo</option>${opts}`;

    $("historyTeam").innerHTML =
        `<option value="">Todos los equipos</option>${opts}`;
}

  function renderWeekSelect() {
    const weeks=allWeeks();

    if(!state.selectedWeek) state.selectedWeek=currentWeek();
    if(!weeks.includes(state.selectedWeek)) weeks.unshift(state.selectedWeek);

    $("weekSelect").innerHTML=weeks.map(w=>
      `<option value="${w}">${escapeHTML(weekLabel(w))}${w===currentWeek()?" · Actual":""}</option>`
    ).join("");

    $("weekSelect").value=state.selectedWeek;
  }

  function renderHistory() {
    const teamFilter=$("historyTeam").value;
    const dayFilter=$("historyDay").value;

    let matches=selectedWeekMatches().filter(m=>
      (!teamFilter||m.teamId===teamFilter)&&
      (!dayFilter||(m.date&&String(dayNumber(m.date))===dayFilter))
    );

    matches.sort((a,b)=>
      (b.date||"").localeCompare(a.date||"")||b.matchNumber-a.matchNumber
    );

    $("historyCount").textContent=`${matches.length} partidas`;

    $("historyRows").innerHTML=matches.length
      ? matches.map(m=>{
          const details=(m.players||[]).map(p=>
            `${escapeHTML(playerName(p))}: ${Number(p.kills)||0}`
          ).join(" · ");

          return `<tr>
            <td>${m.date?formatDate(m.date):"Histórico anterior"}</td>
            <td>${m.date?dayNames[dayNumber(m.date)]:"—"}</td>
            <td>Partida ${m.matchNumber||1}</td>
            <td><span class="tag-text">${escapeHTML(m.teamTag||"")}</span> ${escapeHTML(m.teamName||"")}</td>
            <td><span class="detail-text">${details}</span></td>
            <td><b class="kill-number">${totalMatch(m)}</b></td>
            <td>
              <div class="action-group">
                <button class="small-action" data-edit="${escapeHTML(m.id)}">Editar</button>
                <button class="small-action delete" data-delete="${escapeHTML(m.id)}">Eliminar</button>
              </div>
            </td>
          </tr>`;
        }).join("")
      : emptyRow(7);
  }

  function renderRankings() {
    const agg=aggregates(
      state.rankingMode==="weekly"
        ? selectedWeekMatches()
        : state.matches
    );

    renderRankRows("rankingMvp",agg.players,"players");
    renderRankRows("rankingTeams",agg.teams,"teams");
  }

  function renderAll() {
    renderWeekSelect();
    renderTeams();
    renderDashboard();
    renderHistory();
    renderRankings();
  }

  function navigate(view) {
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));

    document.querySelectorAll(".nav-link").forEach(b=>
      b.classList.toggle("active",b.dataset.view===view)
    );

    $(`view-${view}`).classList.add("active");

    const titles={
      dashboard:"Panel general",
      teams:"Equipos y rosters",
      register:"Registrar partida",
      history:"Historial de partidas",
      rankings:"Clasificaciones"
    };

    $("pageTitle").textContent=titles[view]||"Panel";
    $("sidebar").classList.remove("open");
  }

  document.querySelectorAll(".nav-link").forEach(b=>
    b.addEventListener("click",()=>navigate(b.dataset.view))
  );

  document.querySelectorAll("[data-go]").forEach(b=>
    b.addEventListener("click",()=>navigate(b.dataset.go))
  );

  $("mobileMenu").addEventListener("click",()=>
    $("sidebar").classList.toggle("open")
  );

  $("weekSelect").addEventListener("change",e=>{
    state.selectedWeek=e.target.value;
    renderAll();
  });

  $("historyTeam").addEventListener("change",renderHistory);
  $("historyDay").addEventListener("change",renderHistory);

  document.querySelectorAll(".ranking-tab").forEach(b=>
    b.addEventListener("click",()=>{
      state.rankingMode=b.dataset.rank;

      document.querySelectorAll(".ranking-tab").forEach(x=>
        x.classList.toggle("active",x===b)
      );

      renderRankings();
    })
  );

  $("teamLogo").addEventListener("change",async e=>{
    const file=e.target.files[0];
    if(!file) return;

    try {
      const imageUrl = await storeImage(file);

       $("teamLogoPreview").src = imageUrl;
       $("teamLogoPreview").hidden = false;
       $("teamLogoPlaceholder").hidden = true;
       $("teamLogo").dataset.imageId = imageUrl;
    } catch(err) {
      showToast(err.message);
      e.target.value="";
    }
  });

  document.querySelectorAll(".player-photo").forEach(input=>
    input.addEventListener("change",async e=>{
      const file=e.target.files[0];
      if(!file) return;

      try {
        const imageUrl = await storeImage(file);
        const n = input.id.replace("playerPhoto", "");
        const preview = $(`playerPreview${n}`);

        preview.src = imageUrl;
        preview.hidden = false;
        input.dataset.imageId = imageUrl;
      } catch(err) {
        showToast(err.message);
        input.value="";
      }
    })
  );

  function resetTeamForm() {
    $("teamForm").reset();

    $("editingTeamId").value = "";

    $("saveTeamBtn").textContent = "Registrar equipo";
    $("cancelTeamEditBtn").hidden = true;

    $("teamLogo").dataset.imageId = "";

    for (let i = 1; i <= 8; i++) {
        $(`playerPhoto${i}`).dataset.imageId = "";
    }

    const logoPreview = $("teamLogoPreview");

    if (logoPreview) {
        logoPreview.src = "";
        logoPreview.hidden = true;
    }

    for (let i = 1; i <= 8; i++) {
        const preview = $(`playerPreview${i}`);

        if (preview) {
            preview.src = "";
            preview.hidden = true;
        }
    }
}

$("cancelTeamEditBtn").addEventListener("click", () => {
    resetTeamForm();
    showToast("Edición cancelada.");
});

$("rosterList").addEventListener("click", async e => {
    const deletePlayer = e.target.closest("[data-delete-player]");

    if (!deletePlayer) return;

    const playerId = deletePlayer.dataset.deletePlayer;

    const player = state.teams
        .flatMap(team => team.players)
        .find(p => p.id === playerId);

    if (!player) return;

    if (!confirm(`¿Eliminar al jugador ${player.name}? Esta acción no se puede deshacer.`)) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from("players")
            .delete()
            .eq("id", playerId);

        if (error) throw error;

        await cargarEquiposSupabase();
        await cargarPartidasSupabase();

        showToast("Jugador eliminado correctamente.");

    } catch (error) {
        console.error("Error eliminando jugador:", error);
        showToast("No se pudo eliminar el jugador: " + error.message);
    }
});

$("rosterList").addEventListener("click", async e => {
    const deleteTeam = e.target.closest("[data-delete-team]");

    if (!deleteTeam) return;

    const teamId = deleteTeam.dataset.deleteTeam;

    const team = state.teams.find(t => t.id === teamId);

    if (!team) return;

    if (!confirm(`¿Eliminar el equipo ${team.tag} - ${team.name} y todos sus registros? Esta acción no se puede deshacer.`)) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from("teams")
            .delete()
            .eq("id", teamId);

        if (error) throw error;

        await cargarEquiposSupabase();
        await cargarPartidasSupabase();

        showToast("Equipo eliminado correctamente.");

    } catch (error) {
        console.error("Error eliminando equipo:", error);
        showToast("No se pudo eliminar el equipo: " + error.message);
    }
});

// BUSCADOR DEL LISTADO OFICIAL

$("rosterSearch").addEventListener("input", () => {
    const search = $("rosterSearch").value
        .trim()
        .toLowerCase();

    const cards = $("rosterList").querySelectorAll(".roster-card");

    cards.forEach(card => {
        const content = card.textContent.toLowerCase();

        card.hidden = !content.includes(search);
    });
});

$("rosterList").addEventListener("click", e => {
    const editButton = e.target.closest("[data-edit-team]");

    if (!editButton) return;

    const teamId = editButton.dataset.editTeam;
    const team = state.teams.find(t => t.id === teamId);

    if (!team) return;

    // Activar modo edición
    $("editingTeamId").value = team.id;

    // Cargar información del equipo
    $("teamTag").value = team.tag;
    $("teamName").value = team.name;

    // Cargar logo
    const logoInput = $("teamLogo");
    logoInput.dataset.imageId = team.logoId || "";

    const logoPreview = logoInput.parentElement.querySelector("img");

    if (logoPreview && team.logoId) {
        logoPreview.src = team.logoId;
        logoPreview.hidden = false;
    }

    // Limpiar los ocho espacios de jugadores
    for (let i = 1; i <= 8; i++) {
        $("playerName" + i).value = "";
        $("playerGameId" + i).value = "";

        const photoInput = $("playerPhoto" + i);
        photoInput.dataset.imageId = "";

        const preview = photoInput.parentElement.querySelector("img");

        if (preview) {
            preview.src = "";
            preview.hidden = true;
        }
    }

    // Cargar jugadores registrados
    team.players.forEach((player, index) => {
        const i = index + 1;

        if (i > 8) return;

        $("playerName" + i).value = player.name;
        $("playerGameId" + i).value = player.gameId || "";

        const photoInput = $("playerPhoto" + i);
        photoInput.dataset.imageId = player.photoId || "";

        const preview = photoInput.parentElement.querySelector("img");

        if (preview && player.photoId) {
            preview.src = player.photoId;
            preview.hidden = false;
        }
    });

    // Cambiar el formulario a modo edición
    $("saveTeamBtn").textContent = "Guardar cambios";
    $("cancelTeamEditBtn").hidden = false;

    $("teamForm").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});

  $("teamForm").addEventListener("submit", async e => {
    e.preventDefault();

    if (!supabaseReady) {
        showToast("Espera a que se conecte la base de datos.");
        return;
    }

    const editingTeamId = $("editingTeamId").value;

    const tag = normalizeTag($("teamTag").value);
    const name = $("teamName").value.trim();

    const players = [];

    for (let i = 1; i <= 8; i++) {
        const nickname = $(`playerName${i}`).value.trim();

        if (nickname) {
            players.push({
                id: editingTeamId
                    ? state.teams.find(t => t.id === editingTeamId)
                        ?.players[i - 1]?.id || null
                    : null,

                nickname,
                game_id: $(`playerGameId${i}`).value.trim(),
                photo_url: $(`playerPhoto${i}`).dataset.imageId || null
            });
        }
    }

    if (!tag || !name || !players.length) {
        showToast("Completa el TAG, nombre y al menos un jugador.");
        return;
    }

    if (state.teams.some(t =>
        t.id !== editingTeamId &&
        t.tag.toLowerCase() === tag.toLowerCase()
    )) {
        showToast("Ese TAG ya pertenece a otro equipo.");
        return;
    }

    const names = players.map(p => p.nickname.toLocaleLowerCase());

    if (new Set(names).size !== names.length) {
        showToast("Hay nombres de jugadores repetidos en el roster.");
        return;
    }

    const logoUrl = $("teamLogo").dataset.imageId || null;

    try {
        if (!editingTeamId) {
            const { data: team, error: teamError } = await supabaseClient
                .from("teams")
                .insert({
                    tag,
                    name,
                    logo_url: logoUrl
                })
                .select()
                .single();

            if (teamError) throw teamError;

            const playersToInsert = players.map(player => ({
                team_id: team.id,
                nickname: player.nickname,
                game_id: player.game_id,
                photo_url: player.photo_url
            }));

            const { error: playersError } = await supabaseClient
                .from("players")
                .insert(playersToInsert);

            if (playersError) {
                await supabaseClient
                    .from("teams")
                    .delete()
                    .eq("id", team.id);

                throw playersError;
            }

            showToast("Equipo registrado correctamente.");

        } else {
            const { error: teamError } = await supabaseClient
                .from("teams")
                .update({
                    tag,
                    name,
                    logo_url: logoUrl
                })
                .eq("id", editingTeamId);

            if (teamError) throw teamError;

            const currentTeam = state.teams.find(t => t.id === editingTeamId);

            const currentPlayerIds = currentTeam.players.map(p => p.id);

            const retainedIds = players
                .filter(p => p.id)
                .map(p => p.id);

            const removedIds = currentPlayerIds.filter(
                id => !retainedIds.includes(id)
            );

            if (removedIds.length > 0) {
                const confirmed = confirm(
                    "Has quitado jugadores del roster. Sus registros históricos de kills también se eliminarán. ¿Deseas continuar?"
                );

                if (!confirmed) {
                    await cargarEquiposSupabase();
                    showToast("Edición cancelada.");
                    return;
                }
            }

            for (const player of players) {
                const playerData = {
                    team_id: editingTeamId,
                    nickname: player.nickname,
                    game_id: player.game_id,
                    photo_url: player.photo_url
                };

                if (player.id) {
                    const { error } = await supabaseClient
                        .from("players")
                        .update(playerData)
                        .eq("id", player.id);

                    if (error) throw error;

                } else {
                    const { error } = await supabaseClient
                        .from("players")
                        .insert(playerData);

                    if (error) throw error;
                }
            }

            if (removedIds.length > 0) {
                const { error } = await supabaseClient
                    .from("players")
                    .delete()
                    .in("id", removedIds);

                if (error) throw error;
            }

            showToast("Equipo y roster actualizados correctamente.");
        }

        await cargarEquiposSupabase();
        await cargarPartidasSupabase();

        resetTeamForm();

    } catch (error) {
        console.error("Error guardando equipo:", error);
        showToast("No se pudo guardar: " + error.message);
    }
});

  function renderMatchPlayers(teamId,values={}) {
    const team=state.teams.find(t=>t.id===teamId);

    if(!team) {
      $("matchPlayers").innerHTML='<div class="empty-state">Selecciona un equipo para cargar sus jugadores.</div>';
      $("matchTotal").textContent="0";
      return;
    }

    $("matchPlayers").innerHTML=team.players.map(p=>{
      const n=playerName(p);
      const id=playerId(p);
      const value=values[id]??values[n]??0;

      return `<div class="match-player-row">
        <span class="match-player-name">
          ${imageMarkup(p.photoId,"player-avatar",`Foto de ${n}`)}
          ${escapeHTML(n)}
        </span>
        <input
          type="number"
          min="0"
          step="1"
          class="kill-input"
          data-player-id="${escapeHTML(id)}"
          data-player="${escapeHTML(n)}"
          value="${Number(value)||0}"
          aria-label="Kills de ${escapeHTML(n)}"
        >
      </div>`;
    }).join("");

    document.querySelectorAll(".kill-input").forEach(input=>
      input.addEventListener("input",updateMatchTotal)
    );

    updateMatchTotal();
  }

  function updateMatchTotal() {
    $("matchTotal").textContent=[...document.querySelectorAll(".kill-input")]
      .reduce((sum,i)=>sum+Math.max(0,parseInt(i.value,10)||0),0);
  }

  $("matchTeam").addEventListener("change",e=>
    renderMatchPlayers(e.target.value)
  );

  function resetMatchForm() {
    $("matchForm").reset();
    $("editingMatchId").value="";
    $("matchNumber").value="1";
    $("matchDate").value=dateString(new Date());
    $("matchTeam").value="";

    $("matchPlayers").innerHTML='<div class="empty-state">Selecciona un equipo para cargar sus jugadores.</div>';
    $("matchTotal").textContent="0";
    $("saveMatchBtn").textContent="Guardar partida";
    $("cancelEditBtn").hidden=true;
  }

  $("matchDate").value=dateString(new Date());

  $("matchForm").addEventListener("submit", async e => {
    e.preventDefault();

    if (!supabaseReady) {
        showToast("Espera a que se conecte la base de datos.");
        return;
    }

    const date = $("matchDate").value;
    const team = state.teams.find(t => t.id === $("matchTeam").value);
    const number = parseInt($("matchNumber").value, 10);

    if (!date || !team || !Number.isInteger(number) || number < 1) {
        showToast("Revisa la fecha, el equipo y el número de partida.");
        return;
    }

    if (dayNumber(date) === 0) {
        showToast("El domingo está reservado para cierre.");
        return;
    }

    const inputs = [...document.querySelectorAll(".kill-input")];

    if (inputs.some(i =>
        i.value.trim() !== "" &&
        (!Number.isInteger(Number(i.value)) || Number(i.value) < 0)
    )) {
        showToast("Las kills deben ser números enteros iguales o mayores que cero.");
        return;
    }

    const players = inputs.map(i => ({
        id: i.dataset.playerId,
        name: i.dataset.player,
        kills: Math.max(0, parseInt(i.value, 10) || 0)
    }));

    if (
        players.length !== team.players.length ||
        players.some(p => !p.id)
    ) {
        showToast("No se pudieron cargar todos los jugadores.");
        return;
    }

    const editingId = $("editingMatchId").value;

    const match = {
        teamId: team.id,
        teamName: team.name,
        teamTag: team.tag,
        date,
        weekId: weekId(date),
        matchNumber: number,
        players
    };

    try {
        let matchId = editingId;

        if (editingId) {
            const { error } = await supabaseClient
                .from("matches")
                .update({
                    match_date: date,
                    match_number: number,
                    team_id: team.id
                })
                .eq("id", editingId);

            if (error) throw error;

        } else {
            const { data, error } = await supabaseClient
                .from("matches")
                .insert({
                    match_date: date,
                    match_number: number,
                    team_id: team.id
                })
                .select()
                .single();

            if (error) throw error;

            matchId = data.id;
        }

        const killsToSave = players.map(player => ({
            match_id: matchId,
            player_id: player.id,
            kills: player.kills
        }));

        const { error: killsError } = await supabaseClient
            .from("player_kills")
            .upsert(killsToSave, {
                onConflict: "match_id,player_id"
            });

        if (killsError) {
            if (!editingId) {
                await supabaseClient
                    .from("matches")
                    .delete()
                    .eq("id", matchId);
            }

            throw killsError;
        }

        match.id = matchId;

        if (editingId) {
            const index = state.matches.findIndex(m => m.id === editingId);

            if (index >= 0) {
                state.matches[index] = match;
            }

            showToast("Partida actualizada correctamente.");
        } else {
            state.matches.push(match);
            showToast("Partida guardada correctamente.");
        }

        state.selectedWeek = match.weekId;

        save();
        resetMatchForm();
        renderAll();
        navigate("history");

    } catch (error) {
        console.error("Error guardando partida:", error);
        showToast("No se pudo guardar la partida: " + error.message);
    }
});

  $("cancelEditBtn").addEventListener("click",resetMatchForm);

  $("historyRows").addEventListener("click", async e => {
    const edit=e.target.closest("[data-edit]");
    const del=e.target.closest("[data-delete]");

    if(edit) {
      const m=state.matches.find(x=>x.id===edit.dataset.edit);
      if(!m) return;

      if(!m.date) {
        showToast("Este registro antiguo no tiene fecha y no puede editarse como partida.");
        return;
      }

      $("editingMatchId").value=m.id;
      $("matchDate").value=m.date;
      $("matchTeam").value=m.teamId;
      $("matchNumber").value=m.matchNumber||1;

      const values={};

      (m.players||[]).forEach(p=>{
        values[p.id||p.name]=p.kills;
        values[p.name]=p.kills;
      });

      renderMatchPlayers(m.teamId,values);
      $("saveMatchBtn").textContent="Guardar cambios";
      $("cancelEditBtn").hidden=false;

      navigate("register");
      window.scrollTo({top:0,behavior:"smooth"});
    }

    if (del) {
    const m = state.matches.find(x => x.id === del.dataset.delete);
    if (!m) return;

    if (!confirm(`¿Eliminar la partida ${m.matchNumber} de ${m.teamName}? Esta acción no se puede deshacer.`)) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from("matches")
            .delete()
            .eq("id", m.id);

        if (error) throw error;

        state.matches = state.matches.filter(x => x.id !== m.id);

        renderAll();
        showToast("Partida eliminada correctamente.");

    } catch (error) {
        console.error("Error eliminando partida:", error);
        showToast("No se pudo eliminar la partida: " + error.message);
    }
}
  });

  $("exportBtn").addEventListener("click",()=>{
    const data={
      app:"Esports Tournament Panel",
      version:3,
      exportedAt:new Date().toISOString(),
      teams:state.teams,
      matches:state.matches,
      images:[...state.images.entries()].map(([id,dataUrl])=>({id,dataUrl}))
    };

    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");

    a.href=url;
    a.download=`respaldo-torneo-${dateString(new Date())}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast("Respaldo descargado con imágenes.");
  });

  const importInput=$("importFile");

  $("importBtn").addEventListener("click",()=>importInput.click());

  importInput.addEventListener("change",async e=>{
    const file=e.target.files[0];
    if(!file) return;

    try {
      const data=JSON.parse(await file.text());

      if(!Array.isArray(data.teams)||!Array.isArray(data.matches)) {
        throw new Error("Formato no válido");
      }

      if(!confirm("Importar este respaldo reemplazará los datos actuales de este navegador. ¿Continuar?")) {
        return;
      }

      for(const image of (data.images||[])) {
        await imageTransaction("readwrite","put",image);
        state.images.set(image.id,image.dataUrl);
      }

      state.teams=data.teams.map(t=>({
        ...t,
        players:(t.players||[]).map(normalizePlayer),
        logoId:t.logoId||""
      }));

      state.matches=data.matches;

      save();
      renderAll();
      showToast("Respaldo importado correctamente.");
    } catch(err) {
      console.error(err);
      showToast("No se pudo importar: archivo no válido.");
    } finally {
      importInput.value="";
    }
  });

  (async()=>{
    try {
      await openImageDb();
      await loadImages();
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(OLD_TEAMS_KEY);
      localStorage.removeItem(OLD_RESULTS_KEY);

      state.teams = [];
      state.matches = [];
      state.selectedWeek=currentWeek();

      await verificarSesion();

      renderAll();
      resetMatchForm();
    } catch(err) {
      console.error(err);
      showToast("No se pudo iniciar el almacenamiento de imágenes. Prueba con otro navegador.");
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(OLD_TEAMS_KEY);
      localStorage.removeItem(OLD_RESULTS_KEY);

      state.teams = [];
      state.matches = [];
      state.selectedWeek=currentWeek();
      renderAll();
      resetMatchForm();
    }
  })();
});