/* Важно! чтобы этот файл по максимуму был автономным. Можно импортировать библиотеки, 
но не импортировать локальные инструменты, которые используются где-то в проекте по мимо этого файла.
Чтобы открыть консоль shared worker файла, надо перейти по ссылке chrome://inspect/#workers (это в хроме) */
/* eslint-disable no-restricted-globals */

import { SocketIO } from './WorkerSocket';

interface SharedMessageEvent<T = any> extends MessageEvent {
  data: T;
}

interface IData extends Record<string, any> {
  event: keyof typeof sendSocketCases;
  url?: string;
  userId?: string;
  checkMessageCount?: number;
}

const socket: { current: SocketIO } = { current: new SocketIO() };
const socketState = {
  connected: false,
  roomId: '',
  userId: '',
};
const chatState: {
  checkChatHistoryTimer: NodeJS.Timeout | undefined;
  initialChatHistoryTimer: NodeJS.Timeout | undefined;
  checkingMessageCount: number;
  initialCountMessages: number;
} = {
  checkChatHistoryTimer: undefined,
  initialChatHistoryTimer: undefined,
  checkingMessageCount: 0,
  initialCountMessages: 0,
};
const messageCancelingTimer = 20000 // is session connected checking timer
const globalSelf = self as any; // SharedWorkerGlobalScope
let ports: MessagePort[] = []; // All of our ports

const socketEffects = {
  new_chat: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  new_global_chat: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  document_create: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  signing_update: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  folder_create: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  document_delete: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  document_move: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  folder_delete: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  document_update: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  document_replace: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  permissions_update: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  agreement_update: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  notification_create: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  rooms_update: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);
  },
  message_view: (content: any, currentPort: MessagePort) => {
    postMessageToPort({ event: 'message_view', message: content }, currentPort);
  },
  members_update: (content: any, currentPort: MessagePort) => {
    console.log(content);
    postMessageToPort({ event: 'members_update', message: content }, currentPort);
  },
  chat: (content: any, currentPort: MessagePort) => {
    postMessageToPort(content, currentPort);

    const { checkingMessageCount, initialCountMessages } = chatState;
    chatState.checkingMessageCount = checkingMessageCount <= 0 ? 0 : checkingMessageCount - 1;

    if (checkingMessageCount > 0) {
      chatState.checkingMessageCount -= 1;
    } else if (initialCountMessages > 0 && checkingMessageCount <= 0) {
      chatState.initialCountMessages -= 1;
      chatState.checkingMessageCount = 0;
    } else if (initialCountMessages <= 0) {
      chatState.initialCountMessages = 0;
    }

    checkingMessageCount <= 0 && clearTimeout(chatState.checkChatHistoryTimer);
  },
};

const socketEvents = Object.keys(socketEffects);

// Post message to all connected ports
const postMessageAll = (msg: any, excluded_port: MessagePort | null = null) => {
  ports.forEach((port) => {
    // Don't post message to the excluded port, if one has been specified
    if (port == excluded_port) return;

    port.postMessage(msg);
  });
};

// Post message to selected connected port
const postMessageToPort = (msg: any, included_port: MessagePort | null = null) => {
  ports.forEach((port) => {
    if (port != included_port) return;

    port.postMessage(msg);
  });
};

const setAllSocketEvents = (currentPort: MessagePort) => {
  socketEvents.forEach((event) => {
    socket.current.on(event, (data: string) => {
      const content = data.startsWith('{') || data.startsWith('[') ? JSON.parse(data) : { event: 'none' };
      socketEffects[event as keyof typeof socketEffects](content, currentPort);
    });
  });
};

const sendChatMessagesCancel = (port: MessagePort, type?: string) => {
  chatState.checkingMessageCount = 0;
  chatState.initialCountMessages = 0;
  postMessageToPort({ event: 'message_cancel', type }, port);
};

const checkConnect = (data: { success: boolean; message: string }, currentPort: MessagePort) => {
  if (!data.success) {
    socketState.userId = '';
    socketState.connected = false;
    socket.current.disconnect();
    postMessageToPort({ message: `need refresh token`, event: 'connect_to_server' }, currentPort);
  } else {
    socketState.connected = true;
  }
};

const sendSocketCases = {
  connect: (data: IData, currentPort: MessagePort) => {
    if (socketState.connected) {
      postMessageToPort({ event: 'connect', message: `The session is already exist` }, currentPort);
      if (socketState.roomId === data.roomId) {
        postMessageToPort({ message: `already exist #${socketState.roomId}`, event: 'init' }, currentPort);
        return;
      }
    } else {
      socketState.userId = data.userId!;
      socket.current.connect({ token: data.token, url: data.url! });
      socket.current.on('connect_to_server', (data: any) => {
        console.log(data);
        const parsedData = JSON.parse(data);
        checkConnect(parsedData, currentPort);
      });
      socket.current.on('auth:get', (message: any) => {
        postMessageAll({ message, event: 'auth:get' });
      });
      chatState.initialCountMessages = data.checkingMessagesCount!;
      !data.checkingMessagesCount && clearTimeout(chatState.initialChatHistoryTimer);
    }

    socket.current.on('connect', () => {
      const date = new Date().toLocaleString();
      postMessageAll({ event: 'connect', message: `The session is open at: ${date}`, sid: socket.current.socket?.id });
      setAllSocketEvents(currentPort);
    });
  },

  init: (data: IData, currentPort: MessagePort) => {
    if (socketState.roomId === data.roomId) {
      postMessageToPort({ message: `already exist #${socketState.roomId}`, event: 'init' }, currentPort);
      return;
    }

    const messageNewRoom = { room_id: data.roomId };
    socketState.roomId = data.roomId;
    socket.current.send('init', messageNewRoom);
    postMessageAll({ message: messageNewRoom, event: 'init' });
  },

  chat: (data: IData, currentPort: MessagePort) => {
    clearTimeout(chatState.checkChatHistoryTimer);
    socket.current.send('chat', data.message);

    chatState.checkChatHistoryTimer = setTimeout(() => sendChatMessagesCancel(currentPort), messageCancelingTimer);
    chatState.checkingMessageCount += 1;
  },

  message_view: (data: IData, currentPort: MessagePort) => {
    socket.current.send('message_view', data.message);
  },

  check_messages_canceling: (data: IData, currentPort: MessagePort) => {
    if (chatState.initialCountMessages <= 0) return;
    sendChatMessagesCancel(currentPort, 'replace');
  },

  logout: (data: IData, currentPort: MessagePort) => {
    postMessageAll({ event: 'logout', message: `User logout. Session is terminated` });
    socketState.connected = false;
    socket.current.disconnect();
    socketState.roomId = '';
    socketState.userId = '';
  },

  close: (data: IData, currentPort: MessagePort) => {
    ports = ports.filter((port) => port != currentPort);
    if (ports.length !== 0) return;
    socketState.connected = false;
    socket.current.disconnect();
  },
};

globalSelf.onconnect = (message: SharedMessageEvent) => {
  const port = message.ports[0] || message.source;
  ports.push(port);
  port.onmessage = (message: SharedMessageEvent<IData>) => {
    sendSocketCases[message.data.event](message.data, message.target as any);
    console.log(message.data.event, message);
  };
};
