sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.ForgotPassword", {

    onInit: function () {
      this._oModel = new JSONModel({
        email: "",
        busy: false,
        successVisible: false,
        successText: "",
        errorVisible: false,
        errorText: ""
      });
      this.getView().setModel(this._oModel, "fp");

      // Focus email input
      var that = this;
      setTimeout(function () {
        var oInput = that.byId("emailInput");
        if (oInput) { oInput.focus(); }
      }, 500);
    },

    onSendReset: function () {
      var sEmail = this._oModel.getProperty("/email").trim();

      if (!sEmail) {
        this._showError("E-posta adresi gerekli");
        return;
      }

      this._oModel.setProperty("/busy", true);
      this._oModel.setProperty("/errorVisible", false);
      this._oModel.setProperty("/successVisible", false);

      var that = this;

      fetch(API._baseUrl + "/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sEmail })
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          that._oModel.setProperty("/busy", false);

          // Backend her durumda ayni mesaji doner (guvenlik icin)
          var oBundle = that.getView().getModel("i18n").getResourceBundle();
          that._oModel.setProperty("/successVisible", true);
          that._oModel.setProperty("/successText",
            oBundle.getText("forgotPasswordSuccess"));
        })
        .catch(function (err) {
          that._oModel.setProperty("/busy", false);
          that._showError("Sunucu ba\u011flant\u0131s\u0131 ba\u015far\u0131s\u0131z: " + err.message);
        });
    },

    onBackToLogin: function () {
      if (window._redigoShowLogin) {
        window._redigoShowLogin();
      }
    },

    _showError: function (sText) {
      this._oModel.setProperty("/errorVisible", true);
      this._oModel.setProperty("/errorText", sText);
    }
  });
});
