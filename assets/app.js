JavaScript

 // ADI INTERNATIONAL - Main JavaScript

document.addEventListener("DOMContentLoaded", () => {
  const languageButton = document.getElementById("lang");
  const contactForm = document.getElementById("contactForm");
  const formMessage = document.getElementById("formMsg");
  const advertiserForm = document.getElementById("advertiserForm");
  const advertiserMessage = document.getElementById("advertiserMsg");
  const yearElement = document.getElementById("year");

  let currentLanguage = "fr";

  // Automatic year
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  // FR / EN translation
  function updateLanguage() {
    document.querySelectorAll("[data-fr][data-en]").forEach(element => {
      element.textContent = element.getAttribute(
        `data-${currentLanguage}`
      );
    });

    if (languageButton) {
      languageButton.textContent =
        currentLanguage === "fr" ? "EN" : "FR";
    }

    document.documentElement.lang = currentLanguage;
  }

  if (languageButton) {
    languageButton.addEventListener("click", () => {
      currentLanguage = currentLanguage === "fr" ? "en" : "fr";
      updateLanguage();
    });
  }

  // Contact form preview
  if (contactForm) {
    contactForm.addEventListener("submit", event => {
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

  // Advertiser form preview
  if (advertiserForm) {
    advertiserForm.addEventListener("submit", event => {
      event.preventDefault();

      if (advertiserMessage) {
        advertiserMessage.textContent =
          currentLanguage === "fr"
            ? "Demande publicitaire prévisualisée. Aucun message n'a été envoyé."
            : "Advertising request previewed. No message has been sent.";
      }

      advertiserForm.reset();
    });
  }

  console.log("ADI INTERNATIONAL is ready.");
});
