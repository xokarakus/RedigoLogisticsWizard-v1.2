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
          if (!res.ok) {
            return res.text().then(function (body) {
              var detail = "";
              try { detail = JSON.parse(body).error || body; } catch (_) { detail = body; }
              throw new Error("HTTP " + res.status + ": " + detail);
            });
          }
          return res.json();
        })
        .catch(function (err) {
          console.error("[API] " + sMethod + " " + sUrl + " failed:", err.message);
          // GET için boş liste dön (view'lar kırılmasın), write için null dön (kaydetme kontrolü çalışsın)
          if (sMethod === "GET") {
            return { data: [], count: 0 };
          }
          return { data: null, error: err.message };
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
