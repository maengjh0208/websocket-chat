from enum import IntEnum, StrEnum


class WSCloseCode(IntEnum):
    UNAUTHORIZED = 4001  # jwt 토큰 만료


class PresenceStatus(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"


class WSMessageType(StrEnum):
    MESSAGE_SEND = "message.send"
    MESSAGE_NEW = "message.new"
    PRESENCE_UPDATE = "presence.update"
