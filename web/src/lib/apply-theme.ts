/** Switches the page between light and dark immediately, without animating every element. */
export function applyThemeToDocument(theme: "light" | "dark") {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(style);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
  window.getComputedStyle(document.body);
  setTimeout(() => style.remove(), 1);
}
