// Event lifecycle behavior — template-owned. Event values live in config.js.
// Every page loads this immediately after config.js.

// Event year, derived from eventStartDate — used for the returning-restaurant
// badge math and the data-<year>.js loader convention.
THEME.eventYear = THEME.eventStartDate
  ? parseInt(THEME.eventStartDate.slice(0, 4), 10)
  : new Date().getFullYear();

// Milliseconds the event timezone is offset from UTC at the given instant.
function eventTzOffsetMs(date) {
  var parts = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: THEME.timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
  var asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return asUtc - date.getTime();
}

// The instant when the event-timezone wall clock reads dateStr + timeStr.
// A bare new Date("YYYY-MM-DDTHH:MM:SS") would use the viewer's timezone,
// making phase boundaries drift by the viewer's offset from the event.
function eventDate(dateStr, timeStr) {
  var wallClock = new Date(dateStr + "T" + (timeStr || "00:00:00") + "Z");
  if (!THEME.timeZone) {
    return new Date(dateStr + "T" + (timeStr || "00:00:00"));
  }
  try {
    var guess = new Date(wallClock.getTime() - eventTzOffsetMs(wallClock));
    // Second pass so instants near a DST transition resolve with that side's offset
    return new Date(wallClock.getTime() - eventTzOffsetMs(guess));
  } catch (e) {
    return new Date(dateStr + "T" + (timeStr || "00:00:00"));
  }
}

// Lifecycle: off-season → pre-event → during → post-event → (archived) off-season.
// THEME.archived is the explicit wind-down switch; trackUrl is only "where the
// Worker lives" and never drives state.
function getEventState() {
  if (THEME.archived) return "off-season";
  var now = new Date();
  var liveDate = THEME.dataLiveDate ? eventDate(THEME.dataLiveDate, "00:01:00") : null;
  var startDate = THEME.eventStartDate ? eventDate(THEME.eventStartDate, "00:00:00") : null;
  var endDate = THEME.eventEndDate ? eventDate(THEME.eventEndDate, "23:59:59") : null;
  if (endDate && now > endDate) return "post-event";
  if (startDate && now >= startDate) return "during";
  if (liveDate && now >= liveDate) return "pre-event";
  return "off-season";
}

// Header wordmark: one link to the newest event of this type, e.g.
// around805.com/burritoweek (the latest-year alias) for
// siteUrl around805.com/burritoweek2026. On around805.com the "805" gets the
// accent color. Legacy single-event domains show and link just the host.
// newTab: the embed lives in someone else's iframe, so leave it instead of
// navigating inside the frame.
function siteTitleHtml(newTab) {
  var display = THEME.siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  var slash = display.indexOf("/");
  var host = slash === -1 ? display : display.slice(0, slash);
  var fullPath = slash === -1 ? "" : display.slice(slash + 1);
  var path = fullPath.replace(/\d{4}$/, "");
  // An archived page keeps its year on screen so a past event reads as that
  // year; the link still goes to the newest event.
  var shownPath = THEME.archived ? fullPath : path;
  var hostHtml = host === "around805.com"
    ? 'around<span class="brand-805">805</span>.com'
    : host;
  var href = "https://" + host + "/" + path;
  return (
    '<a class="site-title" href="' + href + '"' +
    (newTab ? ' target="_blank" rel="noopener"' : "") + ">" +
    '<span class="site-host">' + hostHtml + (path ? "/" : "") + "</span>" +
    (shownPath ? '<span class="site-path">' + shownPath + "</span>" : "") +
    "</a>"
  );
}

// Contact address: <event slug>@contactDomain, e.g. burritoweek2026@samgutentag.com
// for siteUrl around805.com/burritoweek2026. A legacy single-event domain has no
// slug in its path, so it keeps the old sb<item>week<year> form. null when no
// contactDomain is set (callers hide the contact links).
function contactEmail() {
  if (!THEME.contactDomain) return null;
  var path = THEME.siteUrl.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
  var slug = path.split("/").pop();
  if (!slug) {
    var year = (THEME.dataLiveDate || "").slice(0, 4) || new Date().getFullYear();
    slug = "sb" + THEME.itemLabel + "week" + year;
  }
  return slug + "@" + THEME.contactDomain;
}

// Outbound links carry UTM tags so the destination's analytics (restaurant
// sites, the source article) can see which surface and which event sent the
// visit: source = this site's host, medium = "map" or "embed", campaign = the
// event slug (burritoweek2026). Existing utm_* params on the URL win.
function utmUrl(url, medium, content) {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  try {
    var u = new URL(url);
    var site = new URL(THEME.siteUrl);
    var slug = site.pathname.replace(/\/+$/, "").split("/").pop() || site.hostname;
    var tags = {
      utm_source: site.hostname,
      utm_medium: medium,
      utm_campaign: slug,
      utm_content: content,
    };
    Object.keys(tags).forEach(function (k) {
      if (tags[k] && !u.searchParams.has(k)) u.searchParams.set(k, tags[k]);
    });
    return u.toString();
  } catch (e) {
    return url;
  }
}

// Basemap tiles. CARTO raster tiles need an API key since 2026-09-23 (free
// non-commercial tier: 5M tiles/month); without THEME.cartoApiKey the map
// falls back to OpenStreetMap's standard tiles instead of CARTO's
// "API KEY REQUIRED" watermark. Local dev also uses OSM: keys are
// referer-restricted to the live domain, so CARTO 403s localhost.
function basemapTiles() {
  var osm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";
  if (THEME.cartoApiKey && !local) {
    return {
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=" +
        encodeURIComponent(THEME.cartoApiKey),
      options: {
        maxZoom: 20,
        subdomains: "abcd",
        attribution: osm + ' &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    };
  }
  return {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 19, attribution: osm },
  };
}

// A key that the referer allowlist rejects 403s every tile. Swap the layer to
// OSM on the first CARTO error so a misconfigured key degrades to a plain map
// instead of a blank or watermarked one.
function watchBasemap(map, tileLayer) {
  var swapped = false;
  tileLayer.on("tileerror", function () {
    if (swapped || tileLayer._url.indexOf("basemaps.cartocdn.com") === -1) return;
    swapped = true;
    var cartoAttribution = tileLayer.options.attribution;
    THEME.cartoApiKey = null;
    var osm = basemapTiles();
    L.Util.setOptions(tileLayer, { subdomains: "abc", maxZoom: osm.options.maxZoom, attribution: osm.options.attribution });
    if (map.attributionControl) {
      map.attributionControl.removeAttribution(cartoAttribution);
      map.attributionControl.addAttribution(osm.options.attribution);
    }
    tileLayer.setUrl(osm.url);
  });
}

function canCastVotes() {
  var state = getEventState();
  if (state === "pre-event" || state === "during") return true;
  if (state === "post-event" && THEME.eventEndDate) {
    var grace = new Date(eventDate(THEME.eventEndDate, "23:59:59").getTime() + 5 * 86400000);
    return new Date() <= grace;
  }
  return false;
}
