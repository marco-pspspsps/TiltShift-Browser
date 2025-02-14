# TiltShift-Browser

Olá, este projeto surgiu motivado pela necessidade de fazer o projeto final da matéria de mestrado de Computação em GPU da UTFPR-PB, GPU28EE. A proposta é fazer um código, que faça uso da API WebGPU, para calcular e renderizar o efeito de tilt-shift em uma imagem importada no navegador. Os requisitos são:

* Rodar inteiramente local, ou seja sem webserver ou algo assim
* HTML, CSS, JS apenas.
* Plug and play, abriu rodou.

No fim das contas o projeto foi quase bem sucedido, ainda há coisas pra fazer. O problema que estou tendo primariamente é:
Device lost ("unknown"):
D3D12 opening shared handle failed with DXGI_ERROR_DEVICE_REMOVED (0x887A0005)
    at CheckHRESULTImpl (..\..\third_party\dawn\src\dawn\native\d3d\D3DError.cpp:117)

Backend messages:
 * Device removed reason: DXGI_ERROR_DEVICE_HUNG (0x887A0006)

No qual se eu rodo o programa, a GPU dá timeout, não processa a imagem inteira e só é possível recuperar o WebGPU.device reiniciando o computador. Isso provavelmente é causado por falta de memória, algum vazamento que implementei. Ainda não descobri exatamente o que é e as vezes funciona, as vezes não. Também é necessário implementar o blur reduzido ao redor da linha escolhida.

Para utilizar é bem fácil, basta rodar o html usando o google chrome, importar uma imagem, definir dois pontos, os valores das variáveis e rodar.

A conclusão é que com os requisitos necessários, não vale a pena fazer em WebGPU este processo. Complexidade de código imensa, e o ganho de performance é discutível. Afinal o tamanho máximo das imagens usadas neste serão de 4000x4000 na grande maioria dos casos, no qual usar apenas a CPU seria mais rápido. Também há várias limitações na interface com a API, como ser obrigado a usar o canvas, e o canvas de desenho da linha que vai por cima complica ainda mais o processo.
