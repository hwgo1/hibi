import type { Dictionary } from "./types";

export const pt: Dictionary = {
  locale: "pt",
  htmlLang: "pt-BR",
  ogLocale: "pt_BR",
  path: "/pt",
  meta: {
    title: "hibi 日々 · um tutor de programação no seu terminal",
    description:
      "Um tutor de programação que roda no terminal, lê o projeto em que você está trabalhando e te ajuda a aprender a escrever código por conta própria.",
  },
  nav: {
    install: "Instalar",
    docs: "Documentação",
    built: "Por dentro",
    status: "Situação",
  },
  toc: { title: "Nesta página", docs: "Documentação", top: "↑ voltar ao topo" },
  copy: { copy: "copiar", copied: "copiado ✓" },
  term: { skip: "pular", replay: "ver de novo" },
  hero: {
    badge: "experimental · veja o que já funciona →",
    tagline: "melhor a cada dia",
    lead: "Um tutor de programação que roda no seu terminal. Ele lê o projeto em que você está trabalhando e te ajuda a aprender a escrever código por conta própria.",
    primary: "Começar",
    secondary: "Como funciona",
    github: "GitHub",
    foxAlt: "a raposa do hibi deitada em cima do terminal",
    pillars: [
      {
        title: "Dicas em etapas.",
        body: "Quando você trava, o hibi primeiro aponta onde está o problema. Se você continuar travado, ele explica qual é. A correção só aparece no fim.",
      },
      {
        title: "Testa de verdade.",
        body: "Quando você diz que terminou, o hibi roda os testes do seu projeto. Um teste passando vale muito mais do que a opinião do modelo sobre o seu código.",
      },
      {
        title: "Lembra de você.",
        body: "O que você aprende em um projeto continua valendo no próximo, e tudo fica salvo no seu computador.",
      },
    ],
    demoLabel: "Demonstração: uma pessoa resolvendo um exercício com o hibi",
  },
  footer: {
    repo: "Repositório",
    issues: "Issues",
    note: "日々 (hibi) significa “dia após dia”.",
  },
  demos: {
    session: {
      path: "~/code/pipeline",
      greeting: "Oi, Ana. O que você quer aprender hoje?",
      hint: "Escreva do seu jeito, peça um exercício ou digite /help.",
      thinking: "pensando",
      hintLabel: "dica {step} de 3",
      exchanges: [
        {
          input: "me passa um exercício sobre channels",
          thinkMs: 1400,
          reply:
            "Escreva uma função `Fanout` em internal/pipeline/fanout.go. Ela recebe um channel de entrada e devolve três channels de saída, e cada valor que chega vai para exatamente um deles. Quando a entrada fechar, as três saídas também precisam fechar.\n\nJá tem um teste pronto para ela em fanout_test.go.",
        },
        {
          input: "acho que terminei",
          thinkMs: 1200,
          reply:
            "Antes de rodar os testes: o teste cria três consumidores e depois fecha a entrada. O que você acha que acontece com os três channels de saída?",
        },
        {
          input: "os três fecham",
          thinkMs: 1900,
          reply:
            "Dois fecharam e um não:\n```\n--- FAIL: TestFanoutClosesOutputs\n    fanout_test.go:42: output channel 2 was never closed\n```\nVocê esperava que os três fechassem. Em que ponto do seu código cada channel de saída é fechado?",
        },
        {
          input: "não faço ideia, me dá uma dica?",
          thinkMs: 1300,
          hint: 1,
          reply:
            "Olha o fim da `Fanout`, logo depois que o loop sobre a entrada termina. O conceito aqui é quem é responsável por fechar um channel.",
        },
      ],
    },
    onboarding: {
      intro: "Oi! Eu sou o hibi, um tutor de programação.",
      introDetail:
        "Eu te ajudo a aprender de verdade: explico, proponho exercícios e dou dicas,\nsem entregar a resposta pronta. Antes de começar, preciso saber algumas coisas.",
      language: {
        title: "Idioma",
        question:
          "Vou falar em português (Brasil). Aperte Enter para confirmar ou digite outro idioma (en, es):",
      },
      name: {
        title: "Nome",
        question: "Como posso te chamar? (Enter para deixar em branco)",
        answer: "Ana",
      },
      key: {
        title: "Chave de acesso",
        explain:
          "O hibi usa a inteligência artificial de outra empresa, que cobra pelo uso —\nnormalmente alguns centavos por pergunta. Você cria uma chave no site dela e\ncola aqui; o custo fica na sua conta.",
        provider: "Qual empresa você quer usar?",
        choose: "Escolha [1]:",
        where: "Crie sua chave em: https://platform.openai.com/api-keys",
        prompt: "Cole a chave aqui:",
        pasted: "sk-proj-7Rq2vXe9LmT4bNw83f9a",
        checking: "Testando a chave…",
        ok: "funcionou!",
        saved: "Ela fica guardada só no seu computador.",
      },
      ready: "Tudo pronto.",
    },
  },
  sections: [
    {
      id: "why",
      toc: "Por que existe",
      group: "intro",
      eyebrow: "02 · por quê",
      title: "Por que o hibi existe",
      blocks: [
        {
          kind: "lead",
          text: "Nem sempre pedir ajuda a um assistente de IA funciona bem. Ele pode simplesmente te entregar o código completo. No trabalho, talvez seja exatamente o que você quer. Quando você está aprendendo, porém, isso pode atrapalhar: você lê a resposta, entende, cola no projeto e, uma semana depois, não consegue escrever aquilo sozinho. Você também pode não saber direito o que realmente entendeu — e o assistente menos ainda, porque nunca te perguntou.",
        },
        {
          kind: "lead",
          text: "O hibi foi feito para quem está aprendendo. Ele segura a solução de propósito e aumenta a ajuda conforme você tenta. Também confere seu trabalho rodando o código. E vai registrando o que você já mostrou que sabe. Depois de algumas semanas, ele consegue distinguir o que você domina, onde está chutando e o que você não pratica há algum tempo.",
        },
      ],
    },
    {
      id: "install",
      toc: "Instalação",
      group: "intro",
      eyebrow: "03 · instalação",
      title: "Instalação",
      blocks: [
        {
          kind: "p",
          text: "O hibi está no npm. Se você já tem o Bun instalado, é só rodar um comando.",
        },
        { kind: "h3", text: "O que você precisa" },
        {
          kind: "cards",
          items: [
            {
              label: "runtime",
              body: "[Bun](https://bun.sh) 1.2 ou mais recente. É o programa que roda o hibi.",
            },
            {
              label: "modelo",
              body: "Uma chave de API da OpenAI ou da Anthropic. O hibi usa um dos modelos dessas empresas. A chave funciona como uma espécie de senha para usar a sua conta. Você cria a chave no site da empresa, e a cobrança vai direto para você, geralmente alguns centavos por pergunta.",
            },
            {
              label: "opcional",
              body: "git. Sem ele, o hibi não consegue distinguir o código que você escreveu do código que já veio pronto em um template.",
            },
          ],
        },
        { kind: "h3", text: "Com o Bun" },
        {
          kind: "code",
          head: "bash",
          lines: ["bun install -g @hwgo1/hibi"],
          copyable: true,
        },
        { kind: "h3", text: "A partir do código-fonte" },
        {
          kind: "p",
          text: "Se quiser ler ou mexer no código, instale direto do repositório:",
        },
        {
          kind: "code",
          head: "bash",
          lines: [
            "git clone https://github.com/hwgo1/hibi",
            "cd hibi",
            "bun install",
            "cd packages/cli && bun link && cd ../..",
            "bun link @hwgo1/hibi",
          ],
          copyable: true,
        },
        { kind: "h3", text: "Primeira vez" },
        {
          kind: "p",
          text: "Abra uma pasta com o seu código e rode `hibi`. Na primeira vez, ele vai fazer três perguntas:",
        },
        { kind: "terminal", demo: "onboarding" },
        {
          kind: "p",
          text: "O idioma vem primeiro, então o resto já aparece em português. O hibi testa a chave antes de salvá-la e a esconde na tela assim que você cola. Ele também escolhe um modelo recomendado, que você pode trocar depois com `/model`.",
        },
      ],
    },
    {
      id: "quickstart",
      toc: "Primeiros minutos",
      group: "intro",
      eyebrow: "04 · primeiros minutos",
      title: "Seus primeiros cinco minutos",
      blocks: [
        {
          kind: "ol",
          items: [
            {
              title: "Abra um projeto.",
              body: "Entre numa pasta com o seu código e rode `hibi`. Na primeira vez, ele lê o projeto para descobrir a linguagem, como os testes rodam e quais arquivos você escreveu.",
            },
            {
              title: "Diga o que quer aprender.",
              body: "“Quero aprender Go” e “o que é uma variável?” funcionam do mesmo jeito. Se você disser um objetivo, o hibi guarda e continua de onde você parou na próxima vez.",
            },
            {
              title: "Peça um exercício.",
              body: "O hibi escreve o enunciado e diz em qual arquivo você vai trabalhar.",
            },
            {
              title: "Tente e avise quando terminar.",
              body: "O hibi roda seus testes. Se travar, peça uma dica e veja a ajuda passar de “olha aqui” para “o problema é esse”.",
            },
            {
              title: "Digite `/help`.",
              body: "Você vê exemplos do que perguntar e os dois comandos que mais vai usar.",
            },
          ],
        },
      ],
    },
    {
      id: "commands",
      toc: "Comandos",
      group: "docs",
      eyebrow: "5.1 · docs",
      title: "Comandos",
      pre: { eyebrow: "05 · documentação", title: "Documentação" },
      blocks: [
        {
          kind: "p",
          text: "Na maior parte do tempo, você só conversa com o hibi. Os comandos servem para consultar o que ele registrou sobre você ou mudar alguma configuração. O `/help all` mostra todos eles, separados nesses mesmos grupos.",
        },
        {
          kind: "table",
          title: "Seu progresso",
          columns: "minmax(150px,0.8fr) minmax(0,2fr)",
          mono: [true, false],
          rows: [
            [
              "/profile",
              "O que o hibi sabe sobre você: preferências, objetivo e o quanto você domina cada assunto",
            ],
            [
              "/state",
              "O que está em andamento: o exercício atual, quantas dicas você recebeu e perguntas sem resposta",
            ],
            [
              "/signals",
              "O que o hibi percebeu sobre o seu jeito de aprender e o quanto ele confia em cada observação",
            ],
          ],
        },
        {
          kind: "table",
          title: "Conversa",
          columns: "minmax(150px,0.8fr) minmax(0,2fr)",
          mono: [true, false],
          rows: [
            [
              "/undo",
              "Desfaz a última resposta e tira o registro dela do seu histórico",
            ],
            [
              "/clear",
              "Limpa a conversa. O exercício, as dicas e o seu progresso continuam salvos",
            ],
            [
              "/forget <assunto>",
              "Apaga tudo o que foi registrado sobre um assunto",
            ],
          ],
        },
        {
          kind: "table",
          title: "Configurações",
          columns: "minmax(150px,0.8fr) minmax(0,2fr)",
          mono: [true, false],
          rows: [
            [
              "/prefs",
              "Mostra como o hibi está ensinando você. `/prefs <nome> <valor>` muda uma configuração",
            ],
            [
              "/model",
              "Lista os modelos disponíveis. `/model <nome>` troca o modelo",
            ],
            [
              "/provider",
              "Troca entre OpenAI e Anthropic, se você tiver as duas chaves salvas",
            ],
            [
              "/reset",
              "Apaga a chave salva. Na próxima vez que precisar dela, o hibi pede de novo",
            ],
          ],
        },
        {
          kind: "table",
          title: "Outros",
          columns: "minmax(150px,0.8fr) minmax(0,2fr)",
          mono: [true, false],
          rows: [
            [
              "/help",
              "Mostra exemplos do que perguntar. `/help all` lista todos os comandos",
            ],
            [
              "/index",
              "Lê os arquivos do projeto de novo depois de mudanças grandes",
            ],
            ["/cost", "Quanto a conversa custou até agora"],
            [
              "/stop",
              "Desliga o processo do hibi que está rodando em segundo plano",
            ],
            ["/exit", "Sai do hibi"],
          ],
        },
        {
          kind: "note",
          text: "Os comandos ficam em inglês em qualquer idioma, já que é você quem digita. As descrições do `/help` aparecem no seu idioma.",
        },
      ],
    },
    {
      id: "hints",
      toc: "Dicas",
      group: "docs",
      eyebrow: "5.2 · docs",
      title: "Dicas",
      blocks: [
        {
          kind: "p",
          text: "Quando você trava em um exercício, a ajuda vem em três etapas. Acima da resposta, o hibi mostra em qual delas você está, por exemplo, “dica 1 de 3”.",
        },
        {
          kind: "steps",
          items: [
            {
              label: "etapa 1",
              text: "Aponta a parte do código onde está o problema e indica qual conceito está envolvido. Não diz o que está errado.",
            },
            {
              label: "etapa 2",
              text: "Diz qual é o problema e mostra exatamente onde ele está. Não escreve a correção.",
            },
            {
              label: "etapa 3",
              text: "Mostra a correção, explica por que ela funciona e te passa um problema parecido, em outro contexto, para você resolver sozinho.",
            },
          ],
        },
        {
          kind: "subs",
          items: [
            {
              title: "A primeira dica",
              body: "Ela aparece depois da sua primeira tentativa ou depois de uns três minutos no problema. Receber uma dica antes de tentar costuma ajudar menos a fixar o que você aprendeu.",
            },
            {
              title: "Quando a etapa sobe",
              body: "Depois de mais duas tentativas ou de uns oito minutos sem avançar. No mesmo problema, a etapa nunca volta.",
            },
            {
              title: "Começando da etapa 2",
              body: "Se você pergunta sobre um código que já escreveu, o hibi pode pular a etapa 1. Você já encontrou o lugar, então apontar para ele de novo só faria você perder tempo.",
            },
            {
              title: "Pedindo a resposta",
              body: "Peça a resposta diretamente e você recebe. Só que esse exercício passa a valer menos no seu histórico, e o hibi registra que você pediu.",
            },
          ],
        },
        {
          kind: "callout",
          title: "O modelo não decide quanto revelar.",
          body: "A ferramenta de dicas não tem ajuste de “profundidade”, e nenhuma ferramenta do hibi consegue escrever a solução de um exercício. Até onde a dica vai é definido pelo próprio código, com base nas suas tentativas e no tempo que você passou no problema.",
        },
      ],
    },
    {
      id: "checking",
      toc: "Conferindo seu código",
      group: "docs",
      eyebrow: "5.3 · docs",
      title: "Conferindo seu código",
      blocks: [
        {
          kind: "p",
          text: "Quando você diz que terminou, o hibi roda o comando de testes do próprio projeto. O comando muda de acordo com o projeto:",
        },
        {
          kind: "chips",
          items: [
            { text: "go test ./..." },
            { text: "npm test" },
            { text: "cargo test" },
            { text: "pytest" },
          ],
        },
        {
          kind: "p",
          text: "Ele descobre qual é o comando quando lê o projeto pela primeira vez e nunca pega essa informação da conversa. Assim, nenhum texto escrito em um arquivo consegue mudar o que será executado.",
        },
        {
          kind: "callout",
          title: "Problema no ambiente não conta contra você.",
          body: "Se os testes falharem porque falta alguma coisa no seu computador, como um compilador que não foi instalado, o hibi avisa e ajuda a resolver. Isso não conta como uma tentativa errada.",
        },
        {
          kind: "stack",
          items: [
            {
              title: "Projeto sem testes?",
              body: "Nesse caso, o hibi lê seu código e faz uma avaliação. Ela vale mais ou menos um terço de um teste de verdade no seu histórico.",
            },
          ],
        },
      ],
    },
    {
      id: "questions",
      toc: "Perguntas antes",
      group: "docs",
      eyebrow: "5.4 · docs",
      title: "Perguntas antes das respostas",
      blocks: [
        {
          kind: "p",
          text: "Às vezes o hibi faz uma pergunta antes de explicar alguma coisa ou rodar um teste. São três tipos de pergunta, e cada um aparece em um momento natural da conversa.",
        },
        {
          kind: "stack",
          items: [
            {
              title: "Antes de um assunto novo",
              body: "Ele confere o que você já sabe. Se você usa promises em JavaScript, pode perguntar se você se sente à vontade com elas e explicar o `select` do Go fazendo uma comparação entre os dois. Também pode perguntar algo como “se dois programas somam no mesmo contador ao mesmo tempo, o que acontece?” e partir da sua resposta.",
            },
            {
              title: "Antes de rodar os testes",
              body: "Ele pergunta o que você espera que seu código faça naquele exercício. Quando o resultado mostra que você estava errado, fica mais fácil corrigir a ideia que você tinha.",
            },
            {
              title: "Depois de um exercício",
              body: "Ele pede que você diga, em uma linha, qual era o problema no fim das contas. Um resumo quase certo pode revelar uma lacuna que um teste passando não mostra.",
            },
          ],
        },
        {
          kind: "p",
          text: "Para pular uma pergunta, é só continuar o que você estava fazendo. O hibi pergunta no máximo uma vez a cada quatro mensagens e seis vezes por sessão. Se você pular duas seguidas, ele para de perguntar até o fim da sessão. Para desligar as perguntas, use `/prefs unsolicitedHints never`.",
        },
      ],
    },
    {
      id: "quizzes",
      toc: "Quizzes",
      group: "docs",
      eyebrow: "5.5 · docs",
      title: "Quizzes",
      blocks: [
        {
          kind: "p",
          text: "Rodar o código não mostra tudo. Saber quando usar um lock é diferente de saber escrever um, então o hibi também faz perguntas de múltipla escolha.",
        },
        {
          kind: "stack",
          items: [
            {
              title: "Três respostas possíveis",
              body: "Certo, errado ou “não sei”. Dizer que não sabe fica registrado como algo para estudar depois e nunca conta como erro. Um chute certo deixaria seu histórico menos fiel.",
            },
          ],
        },
        {
          kind: "chips",
          items: [
            { text: "certo" },
            { text: "errado" },
            { text: "não sei", highlight: true },
          ],
        },
        {
          kind: "stack",
          items: [
            {
              title: "Alternativas erradas que parecem certas",
              body: "As alternativas erradas representam erros que alguém aprendendo poderia cometer de verdade, e cada uma está ligada ao mal-entendido que leva até ela. Quando você escolhe uma, o hibi explica esse mal-entendido e mostra a resposta certa.",
            },
            {
              title: "Sem espiar",
              body: "A resposta certa só aparece depois que você responde. Quem confere a resposta é o código do hibi, então não dá para convencer o modelo a marcar uma resposta como certa.",
            },
          ],
        },
      ],
    },
    {
      id: "goals",
      toc: "Objetivos",
      group: "docs",
      eyebrow: "5.6 · docs",
      title: "Objetivos",
      blocks: [
        {
          kind: "p",
          text: "Conte ao hibi onde você quer chegar: aprender uma linguagem, se preparar para entrevistas, construir um projeto. Ele guarda isso e retoma quando você volta (“Da última vez, você estava em: aprender Go.”).",
        },
        {
          kind: "p",
          text: "Quando você pergunta o que fazer agora, o hibi sugere dois ou três assuntos com base no seu histórico:",
        },
        {
          kind: "ul",
          items: [
            "assuntos que você nunca viu",
            "assuntos que você já tentou, mas ainda não domina",
            "assuntos que você disse que sabe, mas nunca mostrou",
            "assuntos que você não pratica há umas três semanas",
          ],
        },
        {
          kind: "p",
          text: "Essa lista é refeita a cada sessão. Não existe um cronograma fixo, porque um plano salvo ficaria desatualizado assim que você aprendesse alguma coisa nova.",
        },
        {
          kind: "p",
          text: "Se você já sabe alguma coisa que ele sugeriu, é só falar. O hibi acredita em você e segue em frente sem te testar.",
        },
      ],
    },
    {
      id: "knows",
      toc: "O que o hibi sabe",
      group: "docs",
      eyebrow: "5.7 · docs",
      title: "O que o hibi sabe sobre você",
      blocks: [
        { kind: "p", text: "O hibi mantém dois registros." },
        {
          kind: "cards",
          items: [
            {
              title: "O histórico",
              file: "evidence.jsonl",
              body: "Tudo o que aconteceu, uma entrada por vez. As entradas nunca são editadas nem apagadas, só recebem novas entradas.",
              sample:
                "12 de setembro, goroutines, testes rodaram e passaram, depois de uma dica",
            },
            {
              title: "A estimativa",
              file: "profile.json",
              body: "O quanto o hibi acha que você sabe de cada assunto. Essa estimativa é calculada a partir do histórico. Quando a fórmula melhora, todo o histórico pode ser recalculado com ela.",
              sample: "0,62 em goroutines, com confiança de 0,40",
            },
          ],
        },
        { kind: "h3", text: "De onde vem cada evidência" },
        {
          kind: "p",
          text: "Um teste que passou é um fato. Acertar uma pergunta de quiz é uma observação. O modelo achar que seu código está certo é uma opinião. Cada entrada do histórico diz de que tipo é, e isso define quanto ela vale.",
        },
        {
          kind: "weights",
          head: ["Fonte", "Peso", "Exemplo"],
          rows: [
            {
              source: "Teste executado",
              weight: 1,
              example: "Seus testes rodaram e passaram ou falharam",
            },
            {
              source: "Resposta de quiz",
              weight: 0.8,
              example: "Você respondeu uma pergunta de múltipla escolha",
            },
            {
              source: "Comportamento",
              weight: 0.5,
              example: "Algo que o hibi observou no seu projeto",
            },
            {
              source: "Avaliação do modelo",
              weight: 0.35,
              example: "O modelo leu seu código e achou que estava certo",
            },
            {
              source: "Sua palavra",
              weight: 0.15,
              example: "Você disse que sabe",
            },
            {
              source: "Ações do hibi",
              weight: 0,
              example: "O hibi explicou algo ou deu uma dica",
            },
          ],
        },
        {
          kind: "p",
          text: "Além disso, resolver sozinho vale o peso inteiro. Resolver depois de ver a correção vale mais ou menos um terço, e pedir a resposta diretamente corta esse valor pela metade de novo.",
        },
        {
          kind: "bars",
          rows: [
            { label: "Sozinho", percent: 100, value: "inteiro" },
            { label: "Depois de ver a correção", percent: 33, value: "≈ ⅓" },
            { label: "Pedindo a resposta", percent: 17, value: "≈ ⅙" },
          ],
        },
        { kind: "h3", text: "Confiança" },
        {
          kind: "p",
          text: "Toda estimativa vem acompanhada do nível de confiança do hibi nela. Uma nota baixa com confiança baixa só quer dizer que o hibi ainda sabe pouco sobre você naquele assunto. Ele nunca mostra uma nota sem a confiança junto.",
        },
        {
          kind: "output",
          command: "/profile",
          lines: [
            [{ text: "mastery", tone: "bold" }],
            [
              { text: "  goroutines: 0.62 " },
              { text: "(confidence 0.40, 3 direct)", tone: "dim" },
            ],
          ],
        },
        { kind: "h3", text: "O que o hibi percebeu" },
        {
          kind: "p",
          text: "Com evidência suficiente, o hibi começa a perceber padrões no seu jeito de aprender. O `/signals` lista esses padrões e o quanto ele confia em cada um:",
        },
        {
          kind: "output",
          command: "/signals",
          lines: [
            [{ text: "observed tendencies", tone: "bold" }],
            [
              { text: "  self-assessment = tends to overestimate " },
              { text: "(55%, 12 events)", tone: "dim" },
            ],
            [
              { text: "  hint-depth = usually unblocks at the first hint " },
              { text: "(50%, 10 events)", tone: "dim" },
            ],
            [
              {
                text: "  these are guesses — declare the opposite with /prefs to override one",
                tone: "dim",
              },
            ],
          ],
        },
        {
          kind: "p",
          text: "A primeira linha vem da comparação entre o que você previu antes de rodar os testes e o resultado: na maioria das vezes, você achava que ia passar, mas não passava.",
        },
        {
          kind: "p",
          text: "São palpites e só aparecem depois de pelo menos oito eventos parecidos. O que você define em `/prefs` sempre vale mais do que um palpite do hibi.",
        },
        { kind: "h3", text: "Assuntos" },
        {
          kind: "p",
          text: "Os assuntos formam uma árvore que cresce conforme você aprende. “linked list”, “linked lists” e “lista encadeada” contam como um único assunto.",
        },
        {
          kind: "chips",
          items: [
            { text: "linked list" },
            { text: "linked lists" },
            { text: "lista encadeada" },
            { text: "→", arrow: true },
            { text: "um assunto só", highlight: true },
          ],
        },
        {
          kind: "p",
          text: "O progresso em um assunto específico também conta, com peso menor, para os assuntos mais amplos acima dele. Resolver algo sobre goroutines também soma um pouco em concorrência.",
        },
      ],
    },
    {
      id: "disagree",
      toc: "Discordando de uma nota",
      group: "docs",
      eyebrow: "5.8 · docs",
      title: "Discordando de uma nota",
      blocks: [
        {
          kind: "p",
          text: "Se o hibi diz que sua nota em ponteiros é 0,2 e você acha que está errado, diga isso. A nota não muda só porque você pediu. O hibi propõe um quiz ou um exercício sobre ponteiros, e é o resultado que muda a nota.",
        },
        {
          kind: "p",
          text: "Discordar não custa nada e nunca abaixa uma nota por si só. Se você contestar o mesmo assunto de novo, o próximo resultado vale um pouco menos, mas o hibi aceita a contestação e propõe outro quiz.",
        },
      ],
    },
    {
      id: "undo",
      toc: "Desfazer e esquecer",
      group: "docs",
      eyebrow: "5.9 · docs",
      title: "Desfazer e esquecer",
      blocks: [
        {
          kind: "stack",
          items: [
            {
              title: "`/undo`",
              body: "Desfaz a última troca de mensagens. O que ela registrou sobre você deixa de contar, mas a conversa continua na tela.",
            },
            {
              title: "`/forget <assunto>`",
              body: "Faz o mesmo com tudo o que foi registrado sobre um assunto.",
            },
          ],
        },
        {
          kind: "p",
          text: "Os dois funcionam adicionando ao histórico uma anotação que cancela as entradas anteriores. Assim, o histórico continua completo e ainda pode ser recalculado.",
        },
        {
          kind: "callout",
          title: "`/forget all forget`",
          body: "Esse comando é a exceção. Ele apaga todo o seu histórico de aprendizado, sem volta. Repetir a palavra serve como confirmação.",
        },
      ],
    },
    {
      id: "settings",
      toc: "Configurações",
      group: "docs",
      eyebrow: "5.10 · docs",
      title: "Configurações",
      blocks: [
        {
          kind: "p",
          text: "Para mudar alguma coisa, use `/prefs <nome> <valor>`.",
        },
        {
          kind: "table",
          head: ["Configuração", "Valores", "Padrão"],
          columns: "minmax(140px,1fr) minmax(0,1.5fr) minmax(0,1.2fr)",
          minWidth: "560px",
          mono: [true, false, false],
          rows: [
            ["name", "qualquer texto", "o que você informou na primeira vez"],
            [
              "language",
              "um código de idioma, como `pt-BR`",
              "detectado no seu computador",
            ],
            ["theoryDepth", "`minimal`, `balanced`, `thorough`", "`balanced`"],
            ["exerciseSize", "`small`, `medium`, `large`", "`medium`"],
            [
              "unsolicitedHints",
              "`never`, `when-stuck`, `proactive`",
              "`when-stuck`",
            ],
            ["explanationStyle", "`concise`, `detailed`", "`concise`"],
          ],
        },
        {
          kind: "p",
          text: "Não existe configuração para o quanto o hibi segura a resposta. Dá para mudar o jeito como ele ensina, mas as dicas em etapas continuam valendo.",
        },
      ],
    },
    {
      id: "data",
      toc: "Seus dados",
      group: "docs",
      eyebrow: "5.11 · docs",
      title: "Onde ficam seus dados",
      blocks: [
        {
          kind: "p",
          text: "Tudo fica no seu computador, dentro de uma pasta chamada `.hibi` na sua pasta de usuário:",
        },
        {
          kind: "tree",
          items: [
            { path: "~/.hibi/", note: "" },
            {
              path: "  credentials.json",
              note: "sua chave de API, que só você consegue ler",
            },
            {
              path: "  profile.json",
              note: "suas preferências, objetivo e notas",
            },
            { path: "  concepts.json", note: "sua árvore de assuntos" },
            {
              path: "  evidence.jsonl",
              note: "o histórico de tudo o que aconteceu",
            },
            { path: "  repos/<id>/", note: "" },
            {
              path: "    repo.json",
              note: "o que o hibi aprendeu sobre esse projeto",
            },
            {
              path: "    session.json",
              note: "o exercício atual, as dicas e as perguntas",
            },
          ],
        },
        {
          kind: "p",
          text: "Suas notas, assuntos e histórico valem para todos os projetos. A sessão e os detalhes de cada projeto ficam separados.",
        },
        {
          kind: "p",
          text: "A única coisa que sai do seu computador é a conversa enviada para a empresa de IA que você escolheu, usando a sua própria chave.",
        },
        { kind: "p", text: "Para começar do zero, apague esta pasta:" },
        {
          kind: "code",
          head: "bash",
          lines: ["rm -rf ~/.hibi"],
          copyable: true,
        },
      ],
    },
    {
      id: "built",
      toc: "Por dentro",
      group: "meta",
      eyebrow: "06 · por dentro",
      title: "Como funciona por dentro",
      blocks: [
        {
          kind: "diagram",
          labels: {
            cli: "hibi cli",
            cliNote: "o terminal, que só exibe e envia",
            editor: "painel no editor",
            editorNote: "planejado",
            socket: "socket",
            daemon: "processo em segundo plano",
            daemonNote: "um por projeto · guarda a sessão",
            core: "core",
            coreNote: "o tutor · sem disco, sem rede",
            disk: "~/.hibi/",
            diskNote: "sessão, assuntos, histórico",
            model: "empresa de IA",
            modelNote: "sua chave · a única conexão externa",
          },
        },
        {
          kind: "p",
          text: "O hibi não tem um modelo de IA próprio. Ele conduz a conversa com o modelo que você escolheu: define as regras de ensino, as ferramentas que ele pode usar e como o seu progresso é registrado.",
        },
        {
          kind: "p",
          text: "Cada projeto tem um pequeno processo rodando em segundo plano que guarda a sessão. A interface do terminal é um cliente simples que conversa com ele por um socket local. No futuro, isso também vai permitir que um painel no editor entre na mesma sessão.",
        },
        {
          kind: "p",
          text: "O hibi não depende do texto da conversa para saber onde você está. O exercício atual, a etapa da dica e o seu histórico ficam salvos em disco e são carregados de novo a cada mensagem. Você pode limpar a conversa no meio de um exercício e o hibi ainda sabe onde você parou.",
        },
        {
          kind: "p",
          text: "O código é TypeScript rodando no Bun, dividido em três pacotes. O `core` é o tutor em si e não acessa disco nem rede diretamente; tudo passa por interfaces pequenas. O `daemon` é o processo em segundo plano, e o `cli` é a interface do terminal.",
        },
      ],
    },
    {
      id: "status",
      toc: "Situação do projeto",
      group: "meta",
      eyebrow: "07 · situação",
      title: "Situação do projeto",
      blocks: [
        {
          kind: "p",
          text: "O hibi está na versão 0.1 e ainda é experimental. Mesmo assim, tudo o que aparece nesta página já funciona.",
        },
        {
          kind: "notyet",
          head: "ainda não existe",
          badge: "0.1 · experimental",
          items: [
            {
              title: "Outras interfaces",
              body: "Por enquanto, só existe a interface de terminal. O processo em segundo plano já está preparado para um painel no editor, mas esse painel ainda não existe.",
            },
            {
              title: "Saídas em linguagem simples",
              body: "O que `/profile`, `/state` e `/signals` mostram ainda está em inglês e usa alguns termos técnicos.",
            },
          ],
        },
        {
          kind: "p",
          text: "Os números que decidem quando uma dica sobe de etapa (duas tentativas, oito minutos, três minutos antes da primeira dica) e com que frequência o hibi faz perguntas são estimativas iniciais. Ainda não foram testados com ninguém além do autor. Se o hibi ajudar cedo ou tarde demais, [abra uma issue](https://github.com/hwgo1/hibi/issues) e conte em qual exercício isso aconteceu.",
        },
      ],
    },
  ],
};
