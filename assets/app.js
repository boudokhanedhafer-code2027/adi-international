JavaScript
// ADI INTERNATIONAL - Main JavaScript

document.addEventListener("DOMContentLoaded", () => {
  const languageButton = document.getElementById("lang");
  let currentLanguage = "fr";

  if (languageButton) {
    languageButton.addEventListener("click", () => {
      currentLanguage = currentLanguage === "fr" ? "en" : "fr";

      document.querySelectorAll("[data-fr][data-en]").forEach(element => {
        element.textContent = element.getAttribute(
          `data-${currentLanguage}`
        );
      });

      languageButton.textContent =
        currentLanguage === "fr" ? "EN" : "FR";
    });
  }

  console.log("ADI INTERNATIONAL is ready.");
});
