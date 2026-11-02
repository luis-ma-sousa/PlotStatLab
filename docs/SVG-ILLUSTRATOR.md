# SVG editável no Adobe Illustrator

O PlotStatLab exporta SVG 1.1 autónomo. Os pontos, barras, linhas, eixos, legendas e comparações mantêm objetos vetoriais separados. Os rótulos continuam a ser texto editável; a aplicação não os transforma em curvas nem coloca uma fotografia do gráfico dentro do SVG.

## Abrir e editar

1. No PSL, finaliza a figura e escolhe **Exportar → SVG → Exportar SVG**.
2. No Illustrator, usa **File → Open / Ficheiro → Abrir** e seleciona o SVG. Abrir o ficheiro permite aceder diretamente aos objetos; se o colocares como ficheiro ligado noutro documento, terás de o incorporar antes de editar o conteúdo.
3. Abre **Window → Layers / Janela → Camadas**. Os grupos têm nomes como `PSL-data`, `PSL-point-…`, `PSL-statistics` e `PSL-axis-labels`. Podem aparecer como grupos dentro de uma camada, conforme a versão do Illustrator.
4. Usa **Direct Selection / Seleção direta** para selecionar uma forma ou ponto. Usa a ferramenta de texto para alterar os rótulos.
5. Para preservar a edição do Illustrator, guarda também uma cópia `.ai`.

## O que a exportação preserva

- Texto Unicode, fonte, tamanho, peso, alinhamento e rotação.
- Preenchimentos e contornos como atributos SVG explícitos, incluindo ausência de preenchimento nas linhas abertas.
- Cores hex, opacidade, dimensões, posições e exceções de pontos individuais.
- Grupos, caminhos e recortes geométricos necessários para manter o gráfico dentro dos eixos.
- As posições automáticas ou manuais das comparações que estão válidas no momento da exportação.

O ficheiro não depende de folhas CSS, scripts, recursos externos, símbolos de uma biblioteca, `foreignObject` ou imagens rasterizadas. Os contornos de seleção, áreas invisíveis de clique e outros controlos do editor são removidos.

## Limites práticos

A fonte utilizada precisa de existir na máquina onde abres o Illustrator; caso contrário, este pode substituí-la. O PSL mantém texto editável de propósito. Converter texto em contornos no Illustrator pode ser útil no último ficheiro a enviar para impressão, mas perde a edição como texto.

As edições feitas no Illustrator não atualizam os dados nem os testes do PSL. Guarda o `.labplot` como projeto científico editável e o SVG/AI como figura para apresentação. Um SVG não substitui o projeto.

A estrutura SVG é validada automaticamente, mas o comportamento de importação pode variar entre versões do Illustrator. A compatibilidade não significa que cada grupo SVG seja convertido numa camada nativa do Illustrator ou que o ficheiro contenha uma sessão de edição `.ai`.
