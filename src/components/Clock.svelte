<script lang="ts">
  let hours = $state('00');
  let minutes = $state('00');
  let seconds = $state('00');
  let dateLabel = $state('');

  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function tick() {
    const now = new Date();
    hours = String(now.getHours()).padStart(2, '0');
    minutes = String(now.getMinutes()).padStart(2, '0');
    seconds = String(now.getSeconds()).padStart(2, '0');
    const m = now.getMonth() + 1;
    const d = now.getDate();
    dateLabel = `${weekdays[now.getDay()]} ${m}月${d}日`;
  }

  $effect(() => {
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });
</script>

<div class="clock">
  <div class="time" aria-live="polite">
    <span>{hours}</span><span class="colon">:</span><span>{minutes}</span><span class="colon">:</span><span class="sec">{seconds}</span>
  </div>
  <div class="date">{dateLabel}</div>
</div>

<style>
  .clock {
    text-align: center;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45), 0 4px 24px rgba(0, 0, 0, 0.35);
    user-select: none;
  }
  .time {
    font-family: "SF Pro Display", "Segoe UI", "Helvetica Neue", sans-serif;
    font-weight: 700;
    font-size: clamp(3.5rem, 9vw, 6.5rem);
    letter-spacing: -0.02em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .colon {
    opacity: 0.75;
    margin: 0 0.02em;
  }
  .sec {
    opacity: 0.92;
  }
  .date {
    margin-top: 0.55rem;
    font-size: clamp(1rem, 2.2vw, 1.35rem);
    font-weight: 400;
    letter-spacing: 0.12em;
    opacity: 0.92;
  }
</style>
