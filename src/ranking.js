/* ranking.js — online leaderboard for the 3D bone stages (shared with 삼공육 LandMark). */
// ── Online ranking ─────────────────────────────────────────────────────────────
/* After a 1P run the score goes to a shared Supabase table and the top 10 for
 * that difficulty (each nickname's best run) shows under the results. The key
 * below is Supabase's publishable key: it is meant to sit in web pages, and the
 * table's row-level security only lets visitors read scores and add new ones. */
export const Ranking = (() => {
  const URL_ = 'https://suqndhxtsmvtwkggsbpx.supabase.co/rest/v1';
  const KEY_ = 'sb_publishable_9QwH5S7HRMQ0O7_lBqamag_PMsGo75x';
  const NICK = 'landmark-nickname';
  const LABEL = { easy: '쉬움', medium: '보통', hard: '어려움' };
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const H = { apikey: KEY_, 'Content-Type': 'application/json' };
  const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getNick = () => { try { return localStorage.getItem(NICK) || ''; } catch { return ''; } };
  const setNick = (n) => { try { localStorage.setItem(NICK, n); } catch { /* private mode */ } };

  async function api(path, opts = {}) {
    const res = await fetch(`${URL_}/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`ranking ${res.status}`);
    return res;
  }
  const top = (d) => api(`landmark_best?select=nickname,score,accuracy&difficulty=eq.${d}&order=score.desc,created_at.asc&limit=10`).then(r => r.json());
  const countAbove = async (d, score) => {
    const r = await api(`landmark_best?select=nickname&difficulty=eq.${d}&score=gt.${score}`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
    return +(r.headers.get('content-range') || '*/0').split('/')[1] || 0;
  };
  const total = async (d) => {
    const r = await api(`landmark_best?select=nickname&difficulty=eq.${d}`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
    return +(r.headers.get('content-range') || '*/0').split('/')[1] || 0;
  };
  const submit = (nickname, run) => api('landmark_scores', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      nickname, difficulty: run.difficulty, score: run.score, hits: run.hits,
      accuracy: run.accuracy, stages: run.stages,
    }),
  });

  function list(rows, nick, myRank, myBest) {
    const li = (i, r) => `<li class="${r.nickname === nick ? 'mine' : ''}"><span class="no">${i}</span>
      <span>${esc(r.nickname)}</span><span class="sc">${fmt(r.score)}</span></li>`;
    let html = rows.map((r, i) => li(i + 1, r)).join('');
    if (nick && myRank > rows.length && myBest != null) {
      html += `<li class="gap">⋯</li>` + li(myRank, { nickname: nick, score: myBest });
    }
    return rows.length ? `<ol class="rank-list">${html}</ol>` : `<p class="rank-note">아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>`;
  }

  /** Render into `box` for a finished 1P run (run.hits === 0 → view only). */
  async function show(box, run) {
    const d = run.difficulty;
    const head = `<div class="rank-head"><b>RANKING</b><span>${LABEL[d] || d} · TOP 10</span></div>`;
    const canPost = run.hits > 0;
    let nick = getNick();
    let posted = false;

    const render = async (msg = '') => {
      box.innerHTML = head + `<p class="rank-note">랭킹 불러오는 중…</p>`;
      try {
        const rows = await top(d);
        let me = '';
        let myRank = 0, myBest = null;
        if (posted) {
          const mine = await api(`landmark_best?select=score&difficulty=eq.${d}&nickname=eq.${encodeURIComponent(nick)}`).then(r => r.json());
          myBest = mine[0]?.score ?? run.score;
          const [above, all] = await Promise.all([countAbove(d, myBest), total(d)]);
          myRank = above + 1;
          me = `<p class="rank-me">이번 점수 <strong>${fmt(run.score)}</strong> · 내 순위 <strong>${myRank}위</strong> / ${all}명</p>`;
        }
        const form = canPost && !posted ? `
          <form class="rank-form"><input maxlength="12" placeholder="닉네임 (12자까지)" value="${esc(nick)}" aria-label="닉네임">
          <button type="submit">랭킹 등록</button></form>` : '';
        const change = posted ? `<p class="rank-note">${esc(nick)} 이름으로 등록했어요 · <button class="rank-change" type="button">닉네임 바꾸기</button></p>` : '';
        box.innerHTML = head + me + form + (msg ? `<p class="rank-note">${msg}</p>` : '') + list(rows, posted ? nick : '', myRank, myBest) + change;
        wire();
      } catch {
        box.innerHTML = head + `<p class="rank-note">랭킹을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>`;
      }
    };

    const post = async (name) => {
      name = name.trim().slice(0, 12);
      if (!name) return render('닉네임을 입력해 주세요.');
      nick = name; setNick(name);
      try { await submit(name, run); posted = true; await render(); }
      catch { await render('등록하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    };

    function wire() {
      const form = box.querySelector('.rank-form');
      if (form) {
        const input = form.querySelector('input');
        input.addEventListener('keydown', (e) => e.stopPropagation());
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          form.querySelector('button').disabled = true;
          post(input.value);
        });
      }
      box.querySelector('.rank-change')?.addEventListener('click', () => {
        try { localStorage.removeItem(NICK); } catch { /* ignore */ }
        nick = ''; posted = false; render('새 닉네임은 다음 판부터 쓰여요.');
      });
    }

    // A returning player with a saved nickname is entered automatically.
    if (canPost && nick) await post(nick); else await render();
  }

  return { show };
})();
