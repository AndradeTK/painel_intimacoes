const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js'); // Usando EmbedBuilder
const bodyParser = require('body-parser');
require('dotenv').config();
const axios = require('axios');


const app = express();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Middleware para processar os dados enviados pelo formulário
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Pasta 'public' para o HTML

// ------------------ Express e EJS --------------------- //
app.set('view engine', 'ejs');
app.set("views", path.join(__dirname) + '/src/views');


const moment = require('moment-timezone');
require('moment/locale/pt-br');

const dataFormatada = (moment().locale('pt-br').format('dddd, D [de] MMMM [de] YYYY')).toUpperCase();

const webhookUrl = process.env.WEBHOOKURL;

// Função para enviar o webhook
async function sendWebhook(user, userId, username, avatarUrl) {
    const data = {
        embeds: [
            {
                title: 'Login Realizado',
                description: `Detalhes do usuário **${username}**`,
                fields: [
                    { name: 'User', value: user, inline: true },
                    { name: 'User ID', value: userId, inline: true },
                    { name: 'Username', value: username, inline: true }
                ],
                thumbnail: {
                    url: avatarUrl
                },
                color: 150080, // Cor do embed
            }
        ],
        username: 'Logs Login - Corregedoria',
        avatar_url: process.env.CORRICON // Avatar do bot
    };

    try {
        const response = await axios.post(webhookUrl, data);
        console.log('Webhook enviado!', response.status);
    } catch (error) {
        console.error('Error sending webhook', error);
    }
}


// Função para gerar o documento PDF via API do Documentero
async function gerarDocumento(data) {
  const response = await fetch('https://app.documentero.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document: process.env.DOCUMENT_KEY, // Altere conforme necessário
      apiKey: process.env.DOCUMENT_APIKEY, // Altere conforme necessário
      format: "pdf", // Mudado para PDF
      data: data
    })
  });

  const result = await response.json();
  if (result.status === 200) {
    return result.data;  // Link do PDF gerado
  } else {
    throw new Error(`Erro ao gerar o documento: ${result.message}`);
  }
}



// Função para enviar o link do PDF para o privado do Discord
async function enviarPdfPrivado(iddiscord, pdfUrl, timestamp, channelId) {
  try {
    // Tentar buscar o usuário
    const user = await client.users.fetch(iddiscord);
    
    // Criar o embed para enviar ao usuário
    const embed = new EmbedBuilder()
      .setColor('#000000') // Cor preta
      .setTitle('⚖️ Corregedoria Geral PMC - Intimação ')
      .setDescription('Você está sendo intimado a comparecer ao departamento para prestar esclarecimentos. **Abra o documento** para mais informações! \n \n `Acha que isso foi um erro? Entre em contato conosco!`')
      .setTimestamp(timestamp)
      .setThumbnail(process.env.CORRICON)
      .setFooter({ 
        text: 'Clique para baixar o PDF',
         iconURL: 'https://cdn-icons-png.flaticon.com/512/4726/4726010.png'
      });

    // Tentar enviar DM
    await user.send({
      embeds: [embed],
      files: [{ attachment: pdfUrl, name: 'intimacao.pdf' }]
    });

    
  } catch (error) {
    res.render('error');
    console.error('Erro ao enviar a intimação por DM:', error);

    // Caso não consiga enviar a DM, enviar mensagem de erro no canal definido
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000') // Vermelho para erro
      .setTitle('Falha ao enviar a intimação')
      .setDescription(`Não foi possível enviar a intimação para <@${iddiscord}> por DM. Verifique se o usuário está com mensagens privadas habilitadas.`)
      .setTimestamp(new Date());

    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [errorEmbed] });
  }
}

// Rota principal para lidar com a submissão do formulário
// Rota principal para lidar com a submissão do formulário
app.post('/intimar', async (req, res) => {
  var { iddiscord, num, intimado, passaporte, patente, hora,data, numinquerito, userid, usernome } = req.body; // Capture o userid e usernome

 
  const timestamp = new Date(); // Timestamp da data da intimação
  const intimacaoData = {
    num,
    numinquerito,
    intimado,
    passaporte,
    patente,
    data,
    hora,
    dataemissao: timestamp.toLocaleDateString(),
    logo: process.env.CORRICON,
    asscorrgeral: process.env.ASSCORR
  };

  try {
    // 1. Gerar o documento PDF
    const pdfUrl = await gerarDocumento(intimacaoData);

    // 2. Enviar o PDF por DM ao intimado e, caso falhe, enviar erro para o canal
    await enviarPdfPrivado(iddiscord, pdfUrl, timestamp, process.env.INTIMACAOLOGS); // '1203468711877550102' é o canal de log

    // 3. Enviar mensagem no canal com o nome e ID da pessoa que fez a intimação
    const channel = await client.channels.fetch(process.env.INTIMACAOLOGS); // Canal de log
    const logEmbed = new EmbedBuilder()
      .setColor('#000000') // Verde para sucesso
      .setTitle('⚖️ Corregedoria Geral PMC - Intimação Realizada')
      .setDescription(`**Corregedor**: ${usernome} (${userid}) \n \n **Intimado:** ${intimado} (${iddiscord})`)
      .setTimestamp(new Date());

    await channel.send({ embeds: [logEmbed] });

    res.render('success');
  } catch (error) {
    res.render('error');
    console.error('Erro ao processar intimação:', error);
  }
});

const channelId = process.env.BOTLOG;
client.once('ready', async () => {
  console.log(`🤖 » ${client.user.tag} online!`);

  // Definir o status do bot como "Ouvindo" com a mensagem personalizada
  try {
      await client.user.setActivity('sempre todas as denúncias!', { type: ActivityType.Listening });
  } catch (err) {
      console.error('Erro ao definir atividade:', err);
  }

  // Obter a latência da API
  const latency = Date.now() - client.readyTimestamp;

  // Criar o embed com informações sobre o bot
  const embed = new EmbedBuilder()
      .setColor(0x00FF00) // Cor verde para mostrar que está online
      .setTitle('Bot Online')
      .setDescription('O bot está online e funcionando corretamente!')
      .addFields(
          { name: 'Latência', value: `${latency}ms`, inline: true },
          { name: 'Status', value: '✅ Online', inline: true }
      )
      .setThumbnail(client.user.displayAvatarURL()) // Usa o avatar do bot
      .setTimestamp(); // Adiciona um timestamp no embed

  // Enviar a mensagem no canal
  const channel = client.channels.cache.get(channelId);
  if (channel) {
      channel.send({ embeds: [embed] });
  } else {
      console.log(`Canal com ID ${channelId} não encontrado.`);
  }
});

client.login(process.env.DISCORD_AUTH);




app.get('/', function (req, res) {
  try {
    res.sendFile(__dirname + "/index.html");
  } catch (error) {
    res.status(500).render('error404', {erro: 500});
  }
});

/*app.get('/intimar', function (req, res) {
  res.render('intimar', {useravatar: `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`, userid: userId, usernome: username, dataFormatada: dataFormatada })
});*/

app.get('/intimar', async (req, res) => {
  const accessToken = req.query.access_token;

  try {
      // Obter informações do usuário logado
      const response = await axios.get('https://discord.com/api/v10/users/@me', {
          headers: {
              'Authorization': `Bearer ${accessToken}`
          }
      });

      const user = response.data;
      const userId = user.id;
      const username = user.username;
      const avatar = user.avatar;

      // Verifica se o usuário possui o cargo necessário no servidor
      const guildId = process.env.SERVERID; // ID do servidor
      const roleId = process.env.ROLEID; // ID do cargo

      const memberResponse = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
          headers: {
              'Authorization': `Bot ${process.env.DISCORD_AUTH}` // Token do bot
          }
      });

      const member = memberResponse.data;

      // Verificar se o usuário possui o cargo necessário
      if (member.roles.includes(roleId)) {
          const avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
          

          // Enviar webhook com as informações do usuário
          await sendWebhook(user.username, userId, username, avatarUrl);

          // Renderizar a página se o usuário tiver o cargo correto
          res.render('intimar', {
              useravatar: avatarUrl,
              userid: userId,
              usernome: username,
              dataFormatada: dataFormatada
          });
      } else {
          res.status(403).render('error404', { erro: 'Você não tem permissão para acessar esta página.' });
      }
  } catch (error) {
      console.error('Erro ao verificar permissões ou obter informações do usuário:', error);
      res.status(500).render('error404', { erro: 500 });
  }
});

app.get('/callback', function (req, res) {
  // Envie o usuário para a página callback.html
  try {
    res.sendFile(__dirname + '/src/views/callback.html');
    
  } catch (error) {
    res.status(500).render('error404', {erro: 500});
  }
});

app.use((req, res) => {
  res.status(404).render('error404', {erro: 404});
}) // Erro 404


app.use((err, req, res, next) => {
  console.error(err.stack); // Loga o erro para debug
  res.status(500).render('error404', { erro: 500 });
  
});
var port = process.env.PORT || 3000
app.listen(port, function(erro) {
  if(erro){
      console.log("❌ » Erro :" + erro)
  }
  else{
      console.clear()
      console.log("✅ » Servidor Online na porta 3000...") 
  }
})