FROM ubuntu 

RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get upgrade -y
RUN apt-get install -y nodejs

# set the working directory
WORKDIR /app

# copying the package.json and package-lock.json files
COPY package.json package.json
COPY package-lock.json package-lock.json
RUN npm install

#copy the rest of the application code
COPY index.js index.js

#expose the port on which the server will sun
EXPOSE 8000

#command to tun server
CMD [ "node", "index.js" ]

