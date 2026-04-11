/* =========================
   FIX FINAL - NO OVERFLOW
   ========================= */

(function () {
  'use strict';

  const listEl = document.getElementById('homeNoticeList');
  if (!listEl) return;

  function injectStyles() {
    if (document.getElementById('mail-fix-styles')) return;

    const style = document.createElement('style');
    style.id = 'mail-fix-styles';

    style.textContent = `
      .mail-board-grid{
        overflow-x:auto;
        max-width:100%;
      }

      .mail-board-header,
      .mail-board-row{
        display:grid;
        grid-template-columns:70px 1fr 1fr 90px 150px; /* ✅ reduzido */
        gap:8px;
        padding:8px 10px;
        align-items:center;
        min-width:600px;
      }

      .mail-board-actions{
        display:flex;
        gap:4px;
        flex-wrap:wrap; /* ✅ evita estouro */
      }

      .mail-action-btn{
        font-size:.65rem;
        padding:2px 6px;
        border-radius:999px;
        white-space:nowrap;
        border:1px solid #ccc;
        background:#fff;
        cursor:pointer;
      }

      .mail-action-btn--owner{
        color:#b91c1c;
        border-color:#fca5a5;
      }

      .mail-board-row{
        border-top:1px solid #eee;
      }
    `;

    document.head.appendChild(style);
  }

  function render() {
    injectStyles();

    listEl.innerHTML = `
      <div class="mail-board-grid">

        <div class="mail-board-header">
          <div>Type</div>
          <div>Delivered at</div>
          <div>Correct address</div>
          <div>Status</div>
          <div>Action</div>
        </div>

        <div class="mail-board-row">
          <div>📄 Letter</div>
          <div>160 Adamstown Way</div>
          <div>16 Aderrig Park Avenue</div>
          <div><span style="color:green;">Not collected</span></div>
          <div class="mail-board-actions">
            <button class="mail-action-btn">Collected</button>
            <button class="mail-action-btn">Returned</button>
            <button class="mail-action-btn mail-action-btn--owner">Remove</button>
          </div>
        </div>

      </div>
    `;
  }

  render();

})();
