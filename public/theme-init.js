try {
  var savedTheme = localStorage.getItem("mikroin-theme");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  var darkMode = savedTheme ? savedTheme === "dark" : prefersDark;
  document.documentElement.classList.toggle("dark", darkMode);
  document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
} catch (_) {}
