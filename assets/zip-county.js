/* ZIP code to county lookup for the Southern Illinois Pathways service area.
   Source: US ZIP code database (standard ZIP codes, Illinois), generated October 28, 2026.
   Forms ask for a ZIP code only. County is derived here so reporting stays consistent.
   A ZIP outside the service area returns "Other / Outside service area". */
(function (w) {
  var GROUPS = {
    "62001 62002 62010 62018 62021 62024 62025 62034 62035 62040 62048 62060 62061 62062 62067 62074 62084 62087 62090 62095 62097 62234 62249 62281 62294": 'Madison',
    "62201 62203 62204 62205 62206 62207 62208 62220 62221 62223 62225 62226 62232 62239 62240 62243 62254 62255 62257 62258 62260 62264 62269 62285": 'St. Clair',
    "62236 62244 62295 62298": 'Monroe',
    "62215 62216 62218 62230 62231 62245 62250 62265 62293": 'Clinton',
    "62086 62246 62253 62262 62275 62284": 'Bond',
    "62009 62012 62014 62033 62063 62069 62079 62088 62626 62630 62640 62649 62667 62674 62685 62690": 'Macoupin',
    "62022 62028 62031 62037 62052": 'Jersey',
    "62006 62013 62036 62045 62047 62053 62065 62070": 'Calhoun',
    "62901 62902 62903 62907 62916 62924 62932 62940 62942 62950 62958 62966 62975 62994": 'Jackson',
  };
  var MAP = {};
  Object.keys(GROUPS).forEach(function (zips) {
    zips.split(' ').forEach(function (z) { MAP[z] = GROUPS[zips]; });
  });

  w.SIPZipCounty = {
    /* "62220" -> "St. Clair".  Unknown 5-digit ZIP -> "Other / Outside service area".
       Anything that is not 5 digits -> "" so the caller can show a validation error. */
    lookup: function (zip) {
      var z = String(zip == null ? '' : zip).trim();
      if (!/^[0-9]{5}$/.test(z)) { return ''; }
      return MAP[z] || 'Other / Outside service area';
    },
    isValid: function (zip) {
      return /^[0-9]{5}$/.test(String(zip == null ? '' : zip).trim());
    },
    inServiceArea: function (zip) {
      return Object.prototype.hasOwnProperty.call(MAP, String(zip == null ? '' : zip).trim());
    }
  };
})(window);
