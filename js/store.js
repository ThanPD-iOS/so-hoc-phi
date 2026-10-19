// The whole state is one JSON block in localStorage. On iPhone the home-screen app has its own storage, separate from Safari.

const KEY = "so-hoc-phi";

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Returns false when the write fails, usually because the phone is out of storage.
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// Per-device flags that are not part of the data or the backup.
export function flag(name, value) {
  try {
    if (value === undefined) return localStorage.getItem(`${KEY}:${name}`);
    localStorage.setItem(`${KEY}:${name}`, value);
  } catch {
    return null;
  }
}
