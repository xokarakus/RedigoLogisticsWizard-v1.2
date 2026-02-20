sap.ui.define([], function () {
  "use strict";

  var API = {
    _baseUrl: "http://localhost:3000",

    _request: function (sMethod, sUrl, oBody, oParams) {
      var sFullUrl = this._baseUrl + sUrl;
      if (oParams) {
        var sQuery = Object.keys(oParams)
          .filter(function (k) { return oParams[k] !== undefined && oParams[k] !== null; })
          .map(function (k) { return k + "=" + encodeURIComponent(oParams[k]); })
          .join("&");
        if (sQuery) sFullUrl += "?" + sQuery;
      }

      var oOptions = {
        method: sMethod,
        headers: { "Content-Type": "application/json" }
      };
      if (oBody) oOptions.body = JSON.stringify(oBody);

      return fetch(sFullUrl, oOptions)
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .catch(function (err) {
          console.warn("[API] " + sMethod + " " + sUrl + " failed:", err.message);
          // Return empty response so views don't break
          return { data: [], count: 0 };
        });
    },

    get: function (sUrl, oParams) {
      return this._request("GET", sUrl, null, oParams);
    },

    post: function (sUrl, oBody) {
      return this._request("POST", sUrl, oBody);
    },

    put: function (sUrl, oBody) {
      return this._request("PUT", sUrl, oBody);
    },

    patch: function (sUrl, oBody) {
      return this._request("PATCH", sUrl, oBody);
    },

    del: function (sUrl) {
      return this._request("DELETE", sUrl);
    }
  };

  return API;
});
