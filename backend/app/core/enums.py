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

    TYPING_START = "typing.start"
    TYPING_STOP = "typing.stop"
    TYPING_INDICATOR = "typing.indicator"

    READ_UPDATE = "read.update" # 클라이언트가 방을 열었을때 보내는 신호
