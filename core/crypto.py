"""网易云音乐 API 加密模块

实现 weapi 接口的 AES-CBC + RSA 双重加密。
"""
import os
import json
import base64
import binascii
from Crypto.Cipher import AES

# 网易云音乐固定密钥
NONCE = b"0CoJUm6Qyw8W8jud"
PUB_KEY = "010001"
MODULUS = (
    "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7"
    "b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280"
    "104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932"
    "575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b"
    "3ece0462db0a22b8e7"
)

IV = b"0102030405060708"


def _aes_encrypt(text: str, key: bytes) -> str:
    """AES-128-CBC 加密"""
    pad = 16 - len(text.encode("utf-8")) % 16
    text = text + chr(pad) * pad
    cipher = AES.new(key, AES.MODE_CBC, IV)
    encrypted = cipher.encrypt(text.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")


def _rsa_encrypt(text: str) -> str:
    """RSA 加密 (无填充)"""
    # 反转字符串
    text_reversed = text[::-1]
    # 转为十六进制
    text_hex = binascii.hexlify(text_reversed.encode("utf-8")).decode("utf-8")
    # RSA 加密: pow(int(hex, 16), int(pub_key, 16), int(modulus, 16))
    encrypted_int = pow(int(text_hex, 16), int(PUB_KEY, 16), int(MODULUS, 16))
    # 转为 256 位十六进制字符串
    return format(encrypted_int, "0256x")


def weapi_encrypt(data: dict) -> dict:
    """weapi 接口加密

    Args:
        data: 需要加密的请求参数

    Returns:
        包含 params 和 encSecKey 的加密后参数
    """
    text = json.dumps(data)
    # 生成 16 字节随机密钥
    sec_key = binascii.hexlify(os.urandom(8)).decode("utf-8")[:16]

    # 第一次 AES 加密 (用 NONCE 作为密钥)
    first_encrypt = _aes_encrypt(text, NONCE)
    # 第二次 AES 加密 (用随机密钥)
    second_encrypt = _aes_encrypt(first_encrypt, sec_key.encode("utf-8"))
    # RSA 加密随机密钥
    enc_sec_key = _rsa_encrypt(sec_key)

    return {
        "params": second_encrypt,
        "encSecKey": enc_sec_key,
    }
