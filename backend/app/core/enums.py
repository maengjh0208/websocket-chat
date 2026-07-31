from enum import IntEnum, StrEnum


class Environment(StrEnum):
    LOCAL = "local"
    PROD = "prod"
    TEST = "test"


class WSCloseCode(IntEnum):
    UNAUTHORIZED = 4001  # jwt 토큰 만료


class PresenceStatus(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"


class WSMessageType(StrEnum):
    PING = "ping"
    PONG = "pong"

    MESSAGE_SEND = "message.send"
    MESSAGE_NEW = "message.new"

    PRESENCE_UPDATE = "presence.update"

    TYPING_START = "typing.start"
    TYPING_STOP = "typing.stop"
    TYPING_INDICATOR = "typing.indicator"

    READ_UPDATE = "read.update"

    REACTION_TOGGLE = "reaction.toggle"
    REACTION_UPDATE = "reaction.update"

    FRIEND_REQUEST = "friend.request"
    FRIEND_ACCEPT = "friend.accept"
    FRIEND_DELETE = "friend.delete"

    ROOM_INVITE = "room.invite"

    ERROR = "error"


class FriendStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
