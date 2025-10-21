# Runtime container menor
FROM debian:stable-slim

# Criar diretório de trabalho
ENV LWK_SRC=/usr/src/lwk
RUN mkdir -p $LWK_SRC
WORKDIR $LWK_SRC

# Instalar dependências de build
# RUN apt-get update && apt-get install -y sudo iptables git curl build-essential gcc make libudev-dev && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y jq git curl build-essential gcc make libudev-dev && rm -rf /var/lib/apt/lists/*

# Clonar o repositório
RUN git clone https://github.com/Blockstream/lwk.git . 

# Observar que estamos fixando a um commit específico para garantir reprodutibilidade de commit verified
RUN git checkout fa7aa812c542ab57cf5b035385b939e51eadf334

# Instalar Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs > rustup-init.sh
RUN chmod +x rustup-init.sh && ./rustup-init.sh -y --profile default

# Compilar o binário em modo release 
RUN . "$HOME/.cargo/env" && cargo build --release

# Criar alias para facilitar o uso do binário e dar os acessos
# RUN echo 'alias lwk_cli=$(pwd)/target/release/lwk_cli' >> ~/.bashrc && \
    # export PATH="$PATH:$(pwd)/target/release/lwk_cli"
ENV LWK_TARGET=$LWK_SRC/target/release
RUN chmod +x $LWK_TARGET/lwk_cli
ENV PATH="${PATH}:${LWK_TARGET}"
RUN export PATH=$PATH:$LWK_TARGET


# Diretório para dados
VOLUME ["/data"]

# Porta padrão (você define conforme o servidor LWK expõe)
EXPOSE 32111

# RUN sudo iptables -A INPUT -p tcp -s 10.4.0.1 --dport 32111 -j ACCEPT
# RUN sudo iptables -A INPUT -p tcp -s 127.0.0.1 --dport 32111 -j ACCEPT
# RUN sudo iptables -A INPUT -p tcp --dport 32111 -j DROP

# Comando padrão para iniciar o servidor RPC
# CMD ["lwk_cli", "server", "start", "--electrum-url", "blockstream.info:995"]
# CMD ["lwk_cli", "--network", "testnet", "--addr", "0.0.0.0:32111", "server", "start"]
CMD ["lwk_cli", "--network", "testnet", "--addr", "0.0.0.0:32111", "server", "start", "--datadir", "/data"]