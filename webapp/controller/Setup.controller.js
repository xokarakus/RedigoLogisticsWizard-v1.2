sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.Setup", {

    onInit: function () {
      this._oModel = new JSONModel({
        companyName: "",
        companyCode: "",
        username: "",
        password: "",
        confirmPassword: "",
        busy: false,
        errorVisible: false,
        errorText: ""
      });
      this.getView().setModel(this._oModel, "setup");

      // Focus company name input
      var that = this;
      setTimeout(function () {
        var oInput = that.byId("companyNameInput");
        if (oInput) { oInput.focus(); }
      }, 500);
    },

    onSetup: function () {
      var sCompanyName = this._oModel.getProperty("/companyName").trim();
      var sCompanyCode = this._oModel.getProperty("/companyCode").trim();
      var sUsername = this._oModel.getProperty("/username").trim();
      var sPassword = this._oModel.getProperty("/password");
      var sConfirmPassword = this._oModel.getProperty("/confirmPassword");

      // Validate all fields filled
      if (!sCompanyName || !sCompanyCode || !sUsername || !sPassword || !sConfirmPassword) {
        this._showError("T\u00fcm alanlar\u0131 doldurun");
        return;
      }

      // Validate password match
      if (sPassword !== sConfirmPassword) {
        this._showError("\u015eifreler e\u015fle\u015fmiyor");
        return;
      }

      // Validate password length
      if (sPassword.length < 6) {
        this._showError("\u015eifre en az 6 karakter olmal\u0131");
        return;
      }

      this._oModel.setProperty("/busy", true);
      this._oModel.setProperty("/errorVisible", false);

      var that = this;

      fetch(API._baseUrl + "/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: sUsername,
          password: sPassword,
          display_name: sUsername,
          company_name: sCompanyName,
          company_code: sCompanyCode
        })
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          that._oModel.setProperty("/busy", false);

          if (!result.ok) {
            that._showError(result.body.error || "Kurulum ba\u015far\u0131s\u0131z");
            return;
          }

          // Show success message
          MessageToast.show("Hesap ba\u015far\u0131yla olu\u015fturuldu", { duration: 3000 });

          // Navigate to login screen
          setTimeout(function () {
            if (window._redigoShowLogin) {
              window._redigoShowLogin();
            }
          }, 1500);
        })
        .catch(function (err) {
          that._oModel.setProperty("/busy", false);
          that._showError("Sunucu ba\u011flant\u0131s\u0131 ba\u015far\u0131s\u0131z: " + err.message);
        });
    },

    _showError: function (sText) {
      this._oModel.setProperty("/errorVisible", true);
      this._oModel.setProperty("/errorText", sText);
    }
  });
});
