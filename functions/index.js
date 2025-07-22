const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Inicializa o Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

/**
 * Substitui os placeholders de meta tags em uma string HTML.
 * @param {string} html O conteúdo do arquivo HTML.
 * @param {object} data Os dados para preencher as tags (title, image, description, url).
 * @return {string} O HTML com as tags substituídas.
 */
const replaceMetaTags = (html, data) => {
    // Define valores padrão para o caso de alguma informação não ser encontrada
    const defaults = {
        title: "Museu Itinerante do Videojogo",
        description: "Explore a história e a evolução dos videogames em nosso acervo completo.",
        image: "https://museu-cca6d.web.app/imagens/LOGO%20MUSEU%20DO%20VIDEOGAME%20LETRAS%20BRANCAS%20(1).png",
        url: "https://museu-cca6d.web.app"
    };

    const title = data.title || defaults.title;
    const description = data.description || defaults.description;
    const image = data.image || defaults.image;
    const url = data.url || defaults.url;

    // Limpa a descrição para remover tags HTML e garantir que não seja muito longa
    const cleanDescription = description.replace(/<[^>]+>/g, '').substring(0, 160);

    return html
        .replace(/__OG_TITLE__/g, title)
        .replace(/__OG_DESCRIPTION__/g, cleanDescription)
        .replace(/__OG_IMAGE__/g, image)
        .replace(/__OG_URL__/g, url);
};

exports.dynamicRenderer = functions.https.onRequest(async (req, res) => {
    const requestPath = req.path;
    const itemId = req.query.id;
    const userAgent = req.headers['user-agent'] || '';
    const fullUrl = `https://museu-cca6d.web.app${req.originalUrl}`;

    // Configurações para cada tipo de página dinâmica
    let config;
    if (requestPath.startsWith("/item_detalhe.html")) {
        config = {
            collection: "acervos",
            htmlFile: "item_detalhe.html",
            titleField: "nome",
            descriptionField: "detalhes",
            imageField: "imagem_principal"
        };
    } else if (requestPath.startsWith("/noticia.html")) {
        config = {
            collection: "noticias",
            htmlFile: "noticia.html",
            titleField: "titulo",
            descriptionField: "subtitulo",
            imageField: "imagem_principal"
        };
    }

    // Se o caminho não for de uma página dinâmica, encerra a execução.
    if (!config) {
        res.status(404).send("Página não configurada para renderização dinâmica.");
        return;
    }

    const htmlFilePath = path.resolve(__dirname, `../public/${config.htmlFile}`);

    try {
        // Lê o arquivo HTML base
        let html = fs.readFileSync(htmlFilePath, "utf8");

        // Lista de robôs de redes sociais conhecidos
        const botUserAgents = ['facebookexternalhit', 'Twitterbot', 'WhatsApp', 'LinkedInBot', 'Pinterest', 'Discordbot'];
        const isBot = botUserAgents.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()));

        // Se NÃO for um robô, envia o arquivo HTML original e para a execução.
        // Isso permite que o JavaScript do lado do cliente funcione para utilizadores normais.
        if (!isBot) {
            res.set("Content-Type", "text/html");
            res.status(200).send(html);
            return;
        }

        // --- Caminho de execução apenas para Robôs ---
        console.log(`Bot detectado: ${userAgent}. A renderizar a página para: ${requestPath}`);
        
        // Se não houver ID na URL, serve a página com as tags padrão
        if (!itemId) {
            const finalHtml = replaceMetaTags(html, { url: fullUrl });
            res.set("Content-Type", "text/html");
            res.status(200).send(finalHtml);
            return;
        }

        // Busca o item específico no Firestore
        const docRef = db.collection(config.collection).doc(itemId);
        const docSnap = await docRef.get();

        let metaData = { url: fullUrl };

        if (docSnap.exists) {
            const itemData = docSnap.data();
            console.log(`Documento encontrado com ID: ${itemId}`);
            metaData = {
                ...metaData,
                title: itemData[config.titleField],
                description: itemData[config.descriptionField],
                image: itemData[config.imageField]
            };
        } else {
            console.log(`Documento com ID: ${itemId} não encontrado na coleção ${config.collection}.`);
            // Se o item não for encontrado, usa textos específicos de "Não Encontrado"
            metaData = {
                ...metaData,
                title: "Conteúdo não encontrado",
                description: "O conteúdo que você está procurando não foi encontrado em nosso site."
            };
        }

        // Substitui os placeholders e envia o HTML final para o robô
        const finalHtml = replaceMetaTags(html, metaData);
        res.set("Content-Type", "text/html");
        res.status(200).send(finalHtml);

    } catch (error) {
        console.error(`Erro ao renderizar a página para ${requestPath}:`, error);
        res.status(500).send("Ocorreu um erro interno ao processar a sua solicitação.");
    }
});
