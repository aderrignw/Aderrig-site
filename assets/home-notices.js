// assets/home-notices.js

function isBinNotice(it) {
  const cat = String(it?.category || '').toLowerCase();
  const type = String(it?.type || '').toLowerCase();
  const title = String(it?.title || '').toLowerCase();

  return (
    cat === 'bins' ||
    type === 'bin_collection_import' ||
    title.includes('bin collection')
  );
}

function parseDateSafe(d) {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

function startOfWeekSunday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday start
  return d;
}

function endOfWeekSaturday(start) {
  const d = new Date(start);
  d.setDate(start.getDate() + 6); // Saturday end
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatLongDate(d) {
  return d.toLocaleDateString('en-IE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function getBinName(it) {
  const direct = String(it?.bin || '').trim();
  if (direct) return direct;

  const msg = String(it?.message || it?.title || '');
  const match = msg.match(/([^\n.]+?)\s+bin\s+collection/i);
  return match ? match[1] : 'General';
}

function buildBinSummary(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startWeek = startOfWeekSunday(today);
  const endWeek = endOfWeekSaturday(startWeek);

  const nextWeekStart = addDays(startWeek, 7);
  const nextWeekEnd = endOfWeekSaturday(nextWeekStart);

  const dated = items
    .map(it => ({
      ...it,
      __binDate: parseDateSafe(it.date)
    }))
    .filter(it => it.__binDate)
    .sort((a, b) => a.__binDate - b.__binDate);

  const todayItem = dated.find(it => isSameDay(it.__binDate, today));

  // 🚛 TODAY SPECIAL MESSAGE
  if (todayItem) {
    return {
      title: "🚛 Collection today",
      lines: [
        `Today is your ${getBinName(todayItem)} bin collection day.`,
        `Please make sure your bin is placed outside and secured to avoid any mess on the street.`
      ]
    };
  }

  const thisWeek = dated.filter(
    it => it.__binDate >= startWeek && it.__binDate <= endWeek
  );

  const nextWeek = dated.filter(
    it => it.__binDate >= nextWeekStart && it.__binDate <= nextWeekEnd
  );

  const past = dated.filter(it => it.__binDate < today);

  const upcomingThisWeek = thisWeek.find(it => it.__binDate >= today);
  const upcomingNextWeek = nextWeek[0];
  const fallbackUpcoming = dated.find(it => it.__binDate >= today);

  const lastCollected = past[past.length - 1];

  let primary = upcomingThisWeek || upcomingNextWeek || fallbackUpcoming;

  const lines = [];

  // 🔼 NEXT / THIS WEEK FIRST
  if (primary) {
    if (primary.__binDate >= startWeek && primary.__binDate <= endWeek) {
      lines.push(
        `This week: ${getBinName(primary)} bin on ${formatLongDate(primary.__binDate)}.`
      );
    } else if (
      primary.__binDate >= nextWeekStart &&
      primary.__binDate <= nextWeekEnd
    ) {
      lines.push(
        `Next week: ${getBinName(primary)} bin on ${formatLongDate(primary.__binDate)}.`
      );
    } else {
      lines.push(
        `Next collection: ${getBinName(primary)} bin on ${formatLongDate(primary.__binDate)}.`
      );
    }
  }

  // 🔽 COMPLETED BELOW
  if (lastCollected) {
    lines.push(
      `Last collection: ${getBinName(lastCollected)} bin on ${formatLongDate(lastCollected.__binDate)}.`
    );
  }

  return {
    title: "Bin collection",
    lines
  };
}

export function buildHomeNotices(allItems) {
  const binItems = allItems.filter(isBinNotice);

  if (!binItems.length) return [];

  const summary = buildBinSummary(binItems);

  return [
    {
      id: 'bin-summary',
      title: summary.title,
      lines: summary.lines
    }
  ];
}
