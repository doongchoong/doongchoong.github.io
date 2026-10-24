---
title: "Tree"
date: 2026-10-24T00:10:41+09:00
draft: false
toc : false
tocBorder : true
---

나무의 계절 


{{< raw >}}
<div class="mt-box">
  <div class="mt-stage" id="mt-stage"></div>
  <div class="mt-btns" id="mt-btns">
    <button type="button" data-season="spring">봄</button>
    <button type="button" data-season="summer">여름</button>
    <button type="button" data-season="autumn">가을</button>
    <button type="button" data-season="winter">겨울</button>
    <button type="button" data-new>다른 나무</button>
  </div>
</div>

<style>
  .mt-box { width: 100%; }
  .mt-stage { width: 100%; aspect-ratio: 3 / 2; border-radius: 14px; overflow: hidden; background: #ffffff; /*#f4ecdd;*/ }
  .mt-btns { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 12px; }
  .mt-btns button {
    font: inherit; font-size: 15px; padding: 8px 16px; min-width: 64px;
    border: 1px solid #e2d7c4; border-radius: 999px; background: #fbf6ec; color: #3b302a; cursor: pointer;
  }
  .mt-btns button.on { background: #c4602b; border-color: #c4602b; color: #fff; }
  .mt-btns button[data-new] { margin-left: 8px; }
</style>

<script src="/static/js/marker-tree.min.js"></script>
<script>
  (function () {
    var tree = MarkerTree.mount(document.getElementById('mt-stage'), { season: 'autumn', seed: 20261024 });
    var btns = document.getElementById('mt-btns');
    function mark() {
      btns.querySelectorAll('[data-season]').forEach(function (b) {
        b.classList.toggle('on', b.dataset.season === tree.options.season);
      });
    }
    btns.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.season) tree.set({ season: b.dataset.season });
      else tree.regenerate();
      mark();
    });
    mark();
  })();
</script>
<small>(클로드 오푸스 5.5) </small>
{{< /raw >}}



