document.addEventListener("DOMContentLoaded", async () => {

    function parseDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
}

function dateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function mondayOf(value) {
    const date = parseDate(value);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return dateString(date);
}

function weekId(value) {
    return mondayOf(value);
}

    const status = document.getElementById("publicStatus");
    const teamsContainer = document.getElementById("publicTeamsRanking");
    const playersContainer = document.getElementById("publicPlayersRanking");
    const weekSelect = document.getElementById("publicWeekSelect");

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function renderTable(container, headers, rows) {
        container.innerHTML = `
            <div class="public-table-wrapper">
                <table class="public-table">
                    <thead>
                        <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    try {
        status.textContent = "Cargando clasificaciones...";

        const oldResult = await supabaseClient
    .from("matches")
    .select(`
        id,
        match_date,
        match_number,
        team_id,
        teams(
    name,
    tag,
    logo_url
),
player_kills(
    player_id,
    kills,
    players(   
        nickname,
        photo_url
    )
)
    `)
    .order("match_date", { ascending: false })
    .order("match_number", { ascending: true })
    .order("id", { ascending: true 

    });

        if (oldResult.error) throw oldResult.error;

        const matches = [];

        const weeks = [...new Set(
    (oldResult.data || []).map(match => weekId(match.match_date))
)].sort((a, b) => b.localeCompare(a));

const todayWeek = weekId(dateString(new Date()));

if (!weeks.includes(todayWeek)) {
    weeks.unshift(todayWeek);
}

weekSelect.innerHTML = weeks.map(week => {
    const date = parseDate(week);
    const label = `Semana del ${date.toLocaleDateString("es-CO")}`;

    return `<option value="${week}">${label}</option>`;
}).join("");

weekSelect.value = todayWeek;

        (oldResult.data || []).forEach(match => {
            matches.push({
                teamId: match.team_id,
                team: match.teams,
                date: match.match_date,
                players: match.player_kills || []
            });
        });

        function renderWeeklyRankings() {
    const selectedWeek = weekSelect.value;

    const weeklyMatches = matches.filter(match =>
        weekId(match.date) === selectedWeek
    );

    const teams = new Map();
    const players = new Map();

    weeklyMatches.forEach(match => {
        const teamId = match.teamId;
        const teamName = match.team?.name || "Equipo";
        const teamTag = match.team?.tag || "";

        if (!teams.has(teamId)) {
           teams.set(teamId, {
           name: teamName,
           tag: teamTag,
           logo: match.team?.logo_url || "",
           kills: 0,
           matches: 0
          });
        }

        const team = teams.get(teamId);
        team.matches++;

        match.players.forEach(player => {
            const kills = Number(player.kills) || 0;
            team.kills += kills;

            const playerId = player.player_id;
            const playerKey = `${teamId}-${playerId}`;

            if (!players.has(playerKey)) {
                players.set(playerKey, {
                name: player.players?.nickname || "Jugador",
                photo: player.players?.photo_url || "",
                team: teamName,
                kills: 0,
                matches: 0
              });
            }

            const playerData = players.get(playerKey);
            playerData.kills += kills;
            playerData.matches++;
        });
    });

    const teamRanking = [...teams.values()]
        .sort((a, b) =>
            b.kills - a.kills || a.name.localeCompare(b.name)
        );

    const playerRanking = [...players.values()]
        .sort((a, b) =>
            b.kills - a.kills || a.name.localeCompare(b.name)
        );

    
const podiumOrder = [
    teamRanking[1],
    teamRanking[0],
    teamRanking[2]
].filter(Boolean);

const podium = podiumOrder.map(team => {
    const position = teamRanking.indexOf(team) + 1;

    return `
        <div class="team-podium-place place-${position}">
            <div class="team-podium-logo">
                ${team.logo
                    ? `<img src="${escapeHTML(team.logo)}" class="ranking-team-logo" alt="">`
                    : ""}
            </div>

            <span class="team-podium-medal">
                ${position === 1 ? "🥇" : position === 2 ? "🥈" : "🥉"}
            </span>

            <b>${escapeHTML(team.name)}</b>

            <span class="team-podium-kills">
                ${team.kills} KILLS
            </span>

            <strong>#${position}</strong>
        </div>
    `;
}).join("");

const others = teamRanking.slice(3).map((team, i) => `
    <div class="team-ranking-row">
        <span class="rank-number">#${i + 4}</span>
        ${team.logo
            ? `<img src="${escapeHTML(team.logo)}" class="ranking-team-logo" alt="">`
            : ""}
        <b>${escapeHTML(team.name)}</b>
        <span class="kill-number">${team.kills}</span>
    </div>
`).join("");

teamsContainer.innerHTML = `
    <div class="team-podium">
        ${podium}
    </div>
    ${others ? `<div class="team-ranking-others">${others}</div>` : ""}
`;

    renderTable(
        playersContainer,
        ["POS.", "JUGADOR", "EQUIPO", "ASESINATOS"],
        playerRanking.map((player, index) => [
            index + 1,
            `<div class="public-player-cell">
            ${player.photo ? `<img src="${escapeHTML(player.photo)}" class="public-player-photo" alt="">` : ""}
            <span>${escapeHTML(player.name)}</span>
            </div>`,
            escapeHTML(player.team),
            player.kills,
      ])
    );

    status.textContent = `Clasificación de la semana del ${parseDate(selectedWeek).toLocaleDateString("es-CO")}`;
}

weekSelect.addEventListener("change", renderWeeklyRankings);

renderWeeklyRankings();

    } 
    
    catch (error) {
        console.error("Error cargando clasificaciones:", error);
        status.textContent = "No se pudieron cargar las clasificaciones. Revisa la consola o los permisos de Supabase.";
    }
});