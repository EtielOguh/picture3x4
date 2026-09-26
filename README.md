# Foto 3x4

Aplicação web estática para preparar uma foto 3x4 com a pessoa centralizada e o fundo realmente transparente. Todo o processamento acontece localmente no navegador; fotografias não são enviadas, armazenadas ou analisadas por serviços externos.

## O que a aplicação faz

1. Lê JPG, PNG ou WEBP de até 20 MB.
2. interpreta e corrige a orientação EXIF.
3. Detecta o rosto com MediaPipe e gera um matte de retrato com MODNet/ONNX Runtime Web.
4. Preserva o matte contínuo de cabelo e contornos, reduz halo de cor e o converte em canal alpha.
5. Calcula automaticamente o enquadramento 3:4.
6. Aplica correções técnicas conservadoras após o recorte.
7. Permite ajustar zoom, posição e inclinação.
8. Exporta um PNG transparente de 900 × 1200 px.

## Arquitetura

```text
src/
├── components/             # reservado a componentes compartilhados
├── services/
│   ├── image/
│   │   ├── decode.ts       # leitura e orientação EXIF
│   │   ├── edgeDecontamination.ts # correção RGB nas bordas do alpha
│   │   └── render.ts       # composição 3:4 e exportação PNG
│   └── vision/
│       ├── engine.ts       # coordenação do pipeline de visão
│       ├── modnet.ts       # matting local com ONNX Runtime Web
│       └── maskRefinement.ts # matte e limites da pessoa
├── types/photo.ts
├── App.tsx                 # fluxo e interface
└── styles.css

public/
├── models/                 # BlazeFace TFLite e MODNet ONNX locais
├── ort/                    # runtime ONNX WebAssembly local
└── wasm/                   # runtime MediaPipe local
```

O `BlazeFace Short Range` detecta o rosto e o `MODNet` produz o matte da pessoa. O MODNet foi escolhido para recorte de retratos e roda por ONNX Runtime Web em WebAssembly. Modelo e runtimes são servidos pelo mesmo host da aplicação e não fazem chamadas a APIs. A fotografia nunca é incluída nessas requisições: somente os arquivos estáticos necessários são carregados pelo navegador.

A inferência mantém a proporção da fotografia e usa o lado menor em 512 px, limitado a 1024 px no lado maior. A composição continua sendo feita a partir da fotografia original; a máscara é ampliada separadamente até 2048 px e não passa por blur acumulado. Depois do crop, somente o RGB de pixels semitransparentes é descontaminado com a cor interna mais próxima; o canal alpha não é alterado nessa etapa.

Na primeira utilização, o navegador precisa carregar o modelo MODNet (aproximadamente 26 MB) e o runtime ONNX WASM (aproximadamente 12 MB). Nas utilizações seguintes, esses assets estáticos podem ser atendidos pelo cache HTTP do navegador.

### Calibração do crop 3:4

O enquadramento combina olhos, rosto, estimativa da cabeça, limites da pessoa segmentada e dimensões disponíveis. A pessoa recebe sempre uma única escala uniforme, sem deformação. A saída padrão é 900 × 1200 px e qualquer outra resolução passa pela validação inteira `largura × 4 === altura × 3`.

Os parâmetros visuais ficam em `src/config/crop.ts`:

- `headScale`: escala visual desejada para a cabeça;
- `faceVerticalPosition`: posição vertical desejada da linha dos olhos;
- `topMargin`: margem mínima acima da cabeça;
- `horizontalCenter`: alvo de centralização horizontal.

Esses valores são uma calibração visual inicial da loja, não regras biométricas universais.

### Tratamento técnico

Após o crop, a aplicação analisa apenas os pixels visíveis e limita correções de exposição, balanço de branco, níveis, contraste e saturação. A redução de ruído é aplicada somente em áreas opacas e de baixo contraste; a nitidez não atua nas bordas do recorte, evitando halo. Os limites ficam em `src/config/treatment.ts`.

O tratamento não usa landmarks para mudar o rosto e não contém filtro de beleza, remodelagem facial, aumento de olhos, afinamento, remoção de sinais ou suavização forte de pele.

### Composição e exportação

O canvas final é criado com transparência e nunca recebe preenchimento branco. Antes do download, a aplicação valida a proporção inteira 3:4, a existência simultânea de pixels visíveis e pixels com alpha 0, a assinatura PNG e o color type RGBA do cabeçalho IHDR. O arquivo é gerado exclusivamente com `canvas.toBlob(..., 'image/png')` e baixado como `foto-3x4.png`, sem marca d'água.

A resolução é configurada em `src/config/output.ts` por meio de `targetHeight`; a largura é sempre derivada automaticamente para impedir a criação de uma saída fora da proporção 3:4.

### Ajuste manual simples

O botão **AJUSTAR** revela somente deslocamento horizontal/vertical, zoom uniforme, pequena rotação e restauração do enquadramento automático. Uma moldura 3:4 é sobreposta à prévia apenas na interface. Cada alteração limpa o canvas e recompõe a saída usando diretamente a fotografia segmentada em alta resolução, nunca o resultado da alteração anterior; assim não há recompressão nem perda progressiva.

## Instalação, desenvolvimento e publicação

Requer Node.js 22 ou mais recente e uma conta no GitHub. A aplicação é totalmente estática e não precisa de servidor, banco de dados ou domínio próprio.

### 1. Instalar as dependências

Na pasta do projeto, execute:

```bash
npm install
```

O `package-lock.json` deve permanecer versionado. No GitHub Actions, o projeto usa `npm ci` para fazer uma instalação reproduzível.

### 2. Executar em desenvolvimento

```bash
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173/`.

### 3. Gerar o build de produção

```bash
npm run build
```

O resultado será criado em `dist/`. Para conferir esse build localmente:

```bash
npm run preview
```

Também é possível executar a validação de código separadamente:

```bash
npm run lint
```

### 4. Criar o repositório

Crie um repositório vazio no GitHub, sem domínio personalizado. Depois, caso a pasta ainda não seja um repositório Git, execute:

```bash
git init
git branch -M main
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
```

Substitua `USUARIO` e `REPOSITORIO` pelos nomes reais. Se `origin` já existir, não repita o último comando; confira com `git remote -v`.

### 5. Adicionar, registrar e enviar os arquivos

```bash
git add .
git commit -m "Publica Foto 3x4"
git push -u origin main
```

Não adicione fotografias de clientes ao diretório do projeto. A aplicação nunca grava as fotos selecionadas no sistema de arquivos.

### 6. Ativar o GitHub Pages

No repositório do GitHub:

1. Abra **Settings**.
2. Entre em **Pages**.
3. Em **Build and deployment → Source**, selecione **GitHub Actions**.
4. Abra a aba **Actions** e acompanhe o workflow **Publicar no GitHub Pages**.

Após a publicação, a URL terá este formato:

```text
https://USUARIO.github.io/REPOSITORIO/
```

O `vite.config.ts` usa `base: './'`. Assim, scripts, CSS, logo, modelos TFLite/ONNX e arquivos WASM permanecem relativos ao subdiretório do repositório, sem nome de projeto fixo. O código também resolve esses assets por `import.meta.env.BASE_URL`.

O workflow `.github/workflows/deploy.yml` é executado em cada push para `main` e também pode ser iniciado manualmente. Ele:

1. baixa o repositório;
2. prepara o Node.js;
3. instala dependências com `npm ci`;
4. executa `npm run build`;
5. envia somente `dist/` como artefato;
6. publica o artefato no GitHub Pages.

### 7. Atualizações futuras

Depois de alterar o sistema, valide e publique novamente:

```bash
npm install
npm run lint
npm run build
git add .
git commit -m "Atualiza Foto 3x4"
git push origin main
```

O push em `main` inicia uma nova publicação automaticamente. Se outra pessoa também trabalhar no repositório, sincronize antes de editar:

```bash
git pull --rebase origin main
```

Para diagnosticar uma falha de publicação, consulte os detalhes da execução na aba **Actions**. O build publicado deve sempre conter `index.html` diretamente na raiz de `dist/`.

#### Erro `Get Pages site failed: Not Found`

Esse erro acontece quando o workflow é executado antes de o Pages ser habilitado no repositório. Faça a configuração inicial:

1. Abra `https://github.com/USUARIO/REPOSITORIO/settings/pages`.
2. Em **Build and deployment**, escolha **GitHub Actions** em **Source**.
3. Volte à aba **Actions**.
4. Abra a execução que falhou e selecione **Re-run all jobs**; alternativamente, faça um novo push.

Não adicione `enablement: true` usando apenas o `GITHUB_TOKEN` padrão. A ação `configure-pages` exige outro token com permissões administrativas para habilitar o Pages automaticamente. A ativação manual é necessária somente uma vez e evita armazenar um token adicional no repositório.

## Privacidade

- Todo o processamento da fotografia acontece localmente no navegador. Não existe backend, banco de dados, login, analytics ou upload para APIs.
- O arquivo original e os canvases de trabalho existem somente na memória temporária da aba. Nada é salvo em `localStorage`, `sessionStorage`, IndexedDB ou cache da aplicação.
- A fotografia não é incorporada à URL, ao endereço da página, a parâmetros de consulta ou a logs.
- **Nova foto** cancela o processamento atual, zera os canvases e remove as referências ao arquivo anterior. Recarregar ou fechar a página descarta toda a memória da sessão.
- O Blob URL usado para iniciar o download é temporário e sempre revogado logo após o clique.
- Uma Content Security Policy limita conexões ao próprio endereço da aplicação (`connect-src 'self'`), impedindo envio para APIs externas e serviços de analytics.
- O Git e o GitHub Pages contêm somente código, a logo, o runtime WASM e os modelos locais; fotografias selecionadas nunca são gravadas na pasta do projeto nem enviadas ao GitHub.
- A exportação usa PNG com canal alpha; pixels removidos recebem transparência, não branco.
- O navegador baixa apenas código, logo, WASM e modelos que pertencem à própria aplicação.

## Componentes de visão

- [MODNet](https://github.com/ZHKKKe/MODNet), licença Apache-2.0, para matting de retratos.
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), licença MIT, para inferência local em WebAssembly.
- MediaPipe Tasks Vision para detecção facial local.
