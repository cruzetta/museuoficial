const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const fs = require("fs");
const path = require("path");

// Inicializa o Firebase Admin SDK para aceder à base de dados
admin.initializeApp();
const db = admin.firestore();

const app = express();

// Função auxiliar para encontrar e substituir as meta tags no HTML
const injectMetaTags = (html, meta) => {
  // Garante que os valores não quebrem o HTML (escapa aspas)
  const escapedTitle = meta.title.replace(/"/g, '&quot;');
  const escapedDescription = meta.description.replace(/"/g, '&quot;');

  return html
    .replace(/<title>.*?<\/title>/, `<title>${escapedTitle}</title>`)
    .replace(/<meta property="og:title".*?>/, `<meta property="og:title" content="${escapedTitle}">`)
    .replace(/<meta property="og:description".*?>/, `<meta property="og:description" content="${escapedDescription}">`)
    .replace(/<meta property="og:image".*?>/, `<meta property="og:image" content="${meta.image}">`)
    .replace(/<meta property="og:url".*?>/, `<meta property="og:url" content="${meta.url}">`);
};

// Função principal que serve a página dinâmica
const serveDynamicPage = async (req, res, collectionName, htmlFileName) => {
  const itemId = req.query.id;
  const pageUrl = `https://${req.hostname}${req.originalUrl}`;
  const defaultImageUrl = `https://${req.hostname}/imagens/LOGO%20MUSEU%20DO%20VIDEOGAME%20LETRAS%20BRANCAS%20(1).png`;

  try {
    // Lê o arquivo HTML estático da pasta 'public'
    const htmlPath = path.join(__dirname, '..', 'public', htmlFileName);
    let html = fs.readFileSync(htmlPath, "utf8");

    if (!itemId) {
      // Se não houver ID, serve a página com as tags padrão
      res.send(html); // O HTML já tem as tags padrão
      return;
    }

    // Busca os dados do item/notícia específico no Firestore
    const docRef = db.collection(`artifacts/museu-cca6d/public/data/${collectionName}`).doc(itemId);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      const title = data.nome || data.titulo || "Conteúdo do Museu";
      const description = (data.subtitulo || (data.detalhes || data.descricao || "")).replace(/<[^>]+>/g, "").substring(0, 150) + "...";
      const image = data.imagem_principal || defaultImageUrl;

      const meta = { title, description, image, url: pageUrl };
      const dynamicHtml = injectMetaTags(html, meta);
      res.status(200).send(dynamicHtml);
    } else {
      // Se não encontrar o item, serve a página com tags de "não encontrado"
      const meta = {
        title: "Conteúdo não encontrado",
        description: "O conteúdo que você procura não foi encontrado no nosso acervo.",
        image: defaultImageUrl,
        url: pageUrl,
      };
      res.status(404).send(injectMetaTags(html, meta));
    }
  } catch (error) {
    functions.logger.error("Erro ao servir a página dinâmica:", error);
    res.status(500).send("Ocorreu um erro interno ao carregar esta página.");
  }
};

// Rota para os detalhes do item do acervo
app.get("/item_detalhe.html", (req, res) => {
  serveDynamicPage(req, res, "acervos", "item_detalhe.html");
});

// Rota para as notícias
app.get("/noticia.html", (req, res) => {
  serveDynamicPage(req, res, "noticias", "noticia.html");
});

// Exporta a aplicação Express como uma Cloud Function
exports.app = functions.https.onRequest(app);
