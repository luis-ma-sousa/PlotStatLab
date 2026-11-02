# Validação da primeira versão funcional

Data: 2 de novembro de 2026.

## Automática — aprovada

- Compilação TypeScript estrita e build Vite de produção.
- 31 testes Python: referências R PlantGrowth ANOVA/Tukey, exemplos SciPy Mann–Whitney/Wilcoxon/Friedman, testes t, correções de multiplicidade, alinhamento por ID, valores inválidos/constantes, API e overflow.
- 22 testes TypeScript: quantis Student-t, swarm sem colisões incluindo tamanhos diferentes, posicionamento de oito ligações, KDE, heatmap por identidade, fallback de escala log, projetos e recovery, CSV, estilo seletivo, fingerprint e remoção de estilos órfãos.
- Total: 53 testes automáticos aprovados. O aviso de depreciação Starlette/httpx não alterou os resultados.

## Verificação interativa no navegador integrado — concluída

- Os 13 tipos foram selecionados pela galeria e renderizaram sem coordenadas NaN/Infinity nos dados de demonstração.
- Selecionar ponto `point-1-1`: tamanho 11 e cor #cc2288. O ponto vizinho manteve a cor original. Alterações persistiram após reload.
- ANOVA de Welch com comparações contra controlo e Holm: p global 1,31e-17. A comparação Vehicle não significativa foi omitida; Low dose e High dose receberam **** com ligações distintas acima dos dados.
- Seleção das comparações corrigida após teste real: o pointer capture já não remove a seleção. Clique simples não cria um deslocamento manual nulo.
- Ajuste Y=14 preservado após reload. Arrastamento real alterou dx/dy para aproximadamente 15,31/29,31. Reposição automática testada.
- Fonte Georgia transferida de Treatment response para Distribution pelo diálogo Aplicar estilo. O ponto personalizado original permaneceu #cc2288.
- Exportação SVG real: XML parseável, 800×560, cor individual preservada, sem data-editor-only.
- Exportação PNG real: assinatura de PNG e dimensões 2400×1680 confirmadas no ficheiro, cerca de 203 KB.
- Download do .labplot e reabertura pelo seletor de ficheiros: 2 gráficos, 48 observações, resultados e ponto personalizado preservados.
- Editar 28 para 28,5: comparações ocultas e mensagem de análise desatualizada apresentada.
- Interface observada em janela estreita e desktop. Em janela estreita o painel de formatação abre como gaveta, preservando espaço para a figura.

## Limite de validação

A suite Playwright de ponta a ponta está incluída mas não passou a fase de arranque neste ambiente: o sandbox macOS bloqueia o serviço MachPort do Chromium lançado por terminal. Não se contam esses testes como aprovados. A verificação interativa acima utilizou o navegador integrado. Os casos de publicação especializada, grandes conjuntos de dados e análises ainda planeadas exigem validação posterior; esta entrega não afirma equivalência total ao GraphPad Prism.
