// Conteúdo para o novo arquivo: public/tradutor.js

function googleTranslateElementInit() {
  new google.translate.TranslateElement({
    pageLanguage: 'pt',
    includedLanguages: 'en,es',
    // Não precisamos de layout, pois vamos esconder o widget
  }, 'google_translate_element');
}

/**
 * Define um cookie para o Google Translate.
 * @param {string} key O nome do cookie (será 'googtrans').
 * @param {string} value O valor do cookie (ex: '/pt/en').
 * @param {number} days A duração do cookie.
 */
function setCookie(key, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    // Adiciona SameSite=Lax para segurança e para evitar avisos no console
    document.cookie = key + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
}

/**
 * Lê o valor de um cookie.
 * @param {string} key O nome do cookie.
 * @returns {string|null} O valor do cookie ou nulo.
 */
function getCookie(key) {
    const nameEQ = key + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

/**
 * Ativa o botão de idioma correto com base no cookie do Google.
 */
function setActiveLanguageButton() {
    const savedLangCookie = getCookie('googtrans');
    // O cookie do Google é salvo no formato /auto/en, /auto/es etc.
    // Se não houver cookie, o idioma padrão é 'pt'.
    const langCode = savedLangCookie ? savedLangCookie.split('/')[2] : 'pt';
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === langCode);
    });
}

// Adiciona os listeners quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    const switcher = document.getElementById('custom-language-switcher');
    
    if (switcher) {
        switcher.addEventListener('click', function(event) {
            const target = event.target.closest('.lang-btn');
            if (!target) return;

            const lang = target.dataset.lang;
            
            // O Google usa um cookie chamado 'googtrans' com o formato /idioma_original/idioma_destino
            // Para resetar para o português, usamos /pt/pt
            const cookieValue = `/pt/${lang}`;
            setCookie('googtrans', cookieValue, 30);
            
            // Recarrega a página para que o Google aplique a tradução a partir do cookie
            window.location.reload();
        });
    }
    
    // Garante que o botão correto está ativo no carregamento da página
    setActiveLanguageButton();
});

// Adiciona o script do Google Translate ao final do corpo do documento
const googleTranslateScript = document.createElement('script');
googleTranslateScript.type = 'text/javascript';
googleTranslateScript.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
document.body.appendChild(googleTranslateScript);
