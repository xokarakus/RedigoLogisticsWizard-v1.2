const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(filename, defaultData) {
    this.filepath = path.join(__dirname, '..', 'data', filename);
    this.defaultData = defaultData || [];
    this._ensureFile();
  }

  _ensureFile() {
    const dir = path.dirname(this.filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filepath)) {
      fs.writeFileSync(this.filepath, JSON.stringify(this.defaultData, null, 2));
    }
  }

  readAll() {
    return JSON.parse(fs.readFileSync(this.filepath, 'utf8'));
  }

  _writeAll(data) {
    fs.writeFileSync(this.filepath, JSON.stringify(data, null, 2));
  }

  findById(id) {
    return this.readAll().find(item => item.id === id) || null;
  }

  create(item) {
    const data = this.readAll();
    item.id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    data.push(item);
    this._writeAll(data);
    return item;
  }

  update(id, updates) {
    const data = this.readAll();
    const idx = data.findIndex(item => item.id === id);
    if (idx === -1) return null;
    delete updates.id;
    data[idx] = { ...data[idx], ...updates };
    this._writeAll(data);
    return data[idx];
  }

  remove(id) {
    const data = this.readAll();
    const idx = data.findIndex(item => item.id === id);
    if (idx === -1) return false;
    data.splice(idx, 1);
    this._writeAll(data);
    return true;
  }
}

module.exports = JsonStore;
