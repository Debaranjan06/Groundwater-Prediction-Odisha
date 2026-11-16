import datetime as dt
import re

import bcrypt
import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from .config import JWT_EXPIRE_MINUTES, JWT_SECRET
from .db import db

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=72)


class LoginIn(BaseModel):
    email: str
    password: str


def _hash(pw: str) -> bytes:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt())


def _check(pw: str, hashed: bytes) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed)
    except ValueError:
        return False


def _token(user) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=JWT_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user["_id"]), "exp": exp}, JWT_SECRET, algorithm="HS256")


def _public(user) -> dict:
    return {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        user = db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    if not user:
        raise HTTPException(401, "User no longer exists")
    return user


@router.post("/register", status_code=201)
def register(body: RegisterIn):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address")
    user = {
        "name": body.name.strip(),
        "email": email,
        "password_hash": _hash(body.password),
        "created_at": dt.datetime.now(dt.timezone.utc),
    }
    try:
        res = db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(409, "An account with this email already exists")
    user["_id"] = res.inserted_id
    return {"token": _token(user), "user": _public(user)}


@router.post("/login")
def login(body: LoginIn):
    user = db.users.find_one({"email": body.email.strip().lower()})
    if not user or not _check(body.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password")
    return {"token": _token(user), "user": _public(user)}


@router.get("/me")
def me(user=Depends(get_current_user)):
    return _public(user)
