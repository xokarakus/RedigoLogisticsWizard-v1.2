sap.ui.define(["sap/m/MessageToast"], function (MessageToast) {
  "use strict";

  var API = {
    _baseUrl: (function () {
      if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        return "";
      }
      return "http://localhost:3000";
    })(),

    _token: null,

    setToken: function (t) {
      this._token = t;
      localStorage.setItem("redigo_token", t);
    },

    getToken: function () {
      return this._token || localStorage.getItem("redigo_token");
    },

    getUser: function () {
      var t = this.getToken();
      if (!t) return null;
      try { return JSON.parse(decodeURIComponent(escape(atob(t.split(".")[1])))); } catch (_) { return null; }
    },

    logout: function () {
      this.stopSessionMonitor();
      this._token = null;
      localStorage.removeItem("redigo_token");
      location.reload();
    },

    // ── Session Monitoring (Faz D) ──
    _sessionTimeout: 15 * 60 * 1000, // 15 dakika inactivity
    _lastActivity: Date.now(),
    _sessionMonitor: null,
    _activityListeners: null,
    _warningShown: false,

    startSessionMonitor: function () {
      var that = this;

      // Onceki monitor varsa temizle
      this.stopSessionMonitor();

      this._lastActivity = Date.now();
      this._warningShown = false;

      // Her 30 saniyede kontrol
      this._sessionMonitor = setInterval(function () {
        var inactiveTime = Date.now() - that._lastActivity;

        if (inactiveTime > that._sessionTimeout) {
          that.stopSessionMonitor();
          // SAPUI5 MessageBox kullan — sap.ui.require ile lazy load
          sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
            MessageBox.warning(
              "Oturumunuz uzun s\u00fcreli i\u015flem yap\u0131lmad\u0131\u011f\u0131 i\u00e7in sonland\u0131r\u0131ld\u0131.",
              {
                title: "Oturum S\u00fcresi Doldu",
                onClose: function () { that.logout(); }
              }
            );
          });
          return;
        }

        // 1 dakika kala uyari (bir kez goster)
        var timeLeft = that._sessionTimeout - inactiveTime;
        if (timeLeft < 60000 && timeLeft > 55000 && !that._warningShown) {
          that._warningShown = true;
          MessageToast.show(
            "Oturum 1 dakika i\u00e7inde sonlanacak. Etkile\u015fime devam edin.",
            { duration: 10000, width: "25em" }
          );
        }

        // Uyari gosterildikten sonra etkilesim olduysa reset
        if (timeLeft > 60000) {
          that._warningShown = false;
        }
      }, 30000);

      // Kullanici etkilesimi takibi
      var updateFn = function () { that._lastActivity = Date.now(); };
      document.addEventListener("click", updateFn);
      document.addEventListener("keydown", updateFn);
      this._activityListeners = updateFn;
    },

    stopSessionMonitor: function () {
      if (this._sessionMonitor) {
        clearInterval(this._sessionMonitor);
        this._sessionMonitor = null;
      }
      if (this._activityListeners) {
        document.removeEventListener("click", this._activityListeners);
        document.removeEventListener("keydown", this._activityListeners);
        this._activityListeners = null;
      }
    },

    // ── HTTP Methods ──
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

      var sToken = this.getToken();
      if (sToken) {
        oOptions.headers["Authorization"] = "Bearer " + sToken;
      }

      if (oBody) oOptions.body = JSON.stringify(oBody);

      var that = this;
      return fetch(sFullUrl, oOptions)
        .then(function (res) {
          if (res.status === 401) {
            that.logout();
            return;
          }
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
          if (!err) return { data: null, error: "Unauthorized" };
          console.error("[API] " + sMethod + " " + sUrl + " failed:", err.message);
          MessageToast.show("Sunucu hatas\u0131: " + err.message, { duration: 5000 });
          if (sMethod === "GET") {
            return { data: [], count: 0, error: err.message };
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
