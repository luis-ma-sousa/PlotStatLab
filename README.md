# Prismatica

Aplicação local de gráficos científicos com edição SVG, análise estatística e projetos reeditáveis. Primeira versão funcional, com dados sintéticos de demonstração.

## Abrir no Mac atual

Na pasta `Desktop/Prismatica`, abre **Abrir Prismatica.command** com duplo clique. A aplicação abre em **http://127.0.0.1:8765**. Mantém a janela do terminal aberta enquanto trabalhas; Ctrl+C termina o servidor. Se a aplicação já estiver em execução, o atalho abre a instância existente.

Os dados e a gravação automática ficam no navegador deste computador. Usa **Guardar projeto** para obter um ficheiro `.labplot` portátil e **Abrir** para recuperar todas as opções de edição. Abrir a aplicação noutro navegador/origem usa armazenamento separado; o ficheiro do projeto transfere o trabalho.

## O que já funciona

- 13 tipos: barras com swarm, barras, swarm, box, violino, raincloud, emparelhado, dispersão XY, linhas XY, histograma, densidade, ECDF e heatmap.
- Clica num ponto para editar apenas essa observação: cor, tamanho, forma, opacidade e contorno. Identificadores estáveis preservam estas exceções.
- Copia formatação de outro gráfico por inteiro ou só cores, tipografia, eixos ou símbolos. Guarda estilos reutilizáveis no projeto.
- Tabela editável; CSV/TSV e colagem do Excel, incluindo ponto ou vírgula decimal. CSV com colunas opcionais `Subject` e `X`; as restantes colunas são grupos. Dados XY sem X explícito usam o índice da observação, identificado no editor.
- Assistente com testes compatíveis e razões para a sugestão; o utilizador define independência ou emparelhamento.
- Welch, Student, t emparelhado, Mann–Whitney, Wilcoxon, ANOVA, ANOVA de Welch, ANOVA/Tukey HSD, Kruskal–Wallis e Friedman. Correções Holm, Bonferroni e Benjamini–Hochberg.
- Asteriscos calculados a partir de p ajustado; posição automática, arrastamento, ajuste por coordenadas/setas e reposição automática. Brackets aparecem em gráficos categóricos. Gráficos de distribuição, XY e heatmaps não representam comparações de colunas como se fossem coordenadas XY.
- Gravação automática, undo/redo e projetos `.labplot` com dados, resultados e estilos. Alterar dados ou opções estatísticas invalida as anotações até ao recálculo.
- SVG vetorial e PNG de 1× a 4×, sem controlos do editor. O PNG usa dimensões explícitas em pixels; metadados DPI e presets de revistas são trabalho posterior.

## Exemplo de utilização

1. Explora os dados sintéticos ou importa um CSV em **Dados**.
2. Abre **Estatística**, define o desenho, seleciona teste/comparações/correção e calcula.
3. Em **Editor**, clica em pontos, séries, títulos, eixos ou comparações para os selecionar e usa **Formatar figura**.
4. Arrasta uma comparação ou usa os ajustes X/Y. **Repor posição automática** remove a exceção manual.
5. Cria outra figura em **Novo gráfico**, ou usa o seletor no fim da galeria para alterar o tipo atual.
6. **Aplicar estilo** transfere a aparência entre figuras preservando as exceções individuais. Os dados são partilhados entre as figuras deste projeto.
7. Guarda o projeto e exporta as figuras.

As estrelas usam os limiares convencionais p < 0,05 / 0,01 / 0,001 / 0,0001. O alfa selecionado controla quais comparações são consideradas significativas; a legenda estatística do trabalho deve indicar o teste e a correção. Os intervalos das diferenças seguem 1−alfa e, exceto Tukey, são individuais; as barras de IC da média usam 95% e Student-t.

## Desenvolvimento / instalar noutro computador

Requer Node.js compatível com Vite 7 (20.19+ ou 22.12+), pnpm e Python 3.12.

```sh
pnpm install
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-lock.txt
pnpm build
.venv/bin/python scripts/launch.py
```

Para desenvolvimento, executar em dois terminais:

```sh
.venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 8765
pnpm dev
```

O editor de desenvolvimento usa `http://127.0.0.1:5173`; a API é encaminhada para a porta 8765.

## Validação

```sh
pnpm build
pnpm test
.venv/bin/python -m pytest tests/test_statistics.py -q
pnpm exec playwright install chromium
pnpm test:e2e
```

Os testes Playwright requerem o servidor de produção na porta 8765. Neste Mac, o sandbox do agente impediu iniciar o Chromium a partir do terminal; a verificação interativa foi realizada no navegador integrado. Não se apresentam esses testes bloqueados como aprovados. Ver `docs/VALIDACAO.md`.

## Próximos marcos

Ver `docs/PLANO.md`: gráficos agrupados de dois fatores, correlação/regressão, dose–resposta, Kaplan–Meier, forest/Bland–Altman/volcano, modelos mistos, composição multipainel, Excel nativo, tipografia científica avançada e instalador desktop. Estes itens ainda não estão implementados. Ficheiros Prism nativos não são importados.

## Arquitetura

React/TypeScript, SVG com funções D3, motor Python/SciPy/FastAPI. O servidor escuta apenas em 127.0.0.1. O ficheiro de projeto JSON é versionado. O repositório contém apenas código e dados sintéticos de exemplo.
