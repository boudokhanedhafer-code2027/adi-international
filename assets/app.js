JavaScript

 // ADI INTERNATIONAL - Main JavaScript

document.addEventListener("DOMContentLoaded", () => {
  const languageButton = document.getElementById("lang");
  const contactForm = document.getElementById("contactForm");
  const formMessage = document.getElementById("formMsg");
  const yearElement = document.getElementById("year");

  let currentLanguage = "fr";

  // Année automatique
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  // Traduction FR / EN
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

      document.documentElement.lang = currentLanguage;
    });
  }

  // Formulaire de démonstration (aucun message envoyé)
  if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();

      if (formMessage) {
        formMessage.textContent =
          currentLanguage === "fr"
            ? "Prévisualisation réussie. Aucun message n'a été envoyé."
            : "Preview successful. No message has been sent.";
      }
      contactForm.reset();
    });
  }

  console.log("ADI INTERNATIONAL is ready.");
});
