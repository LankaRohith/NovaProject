from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError
from database import SessionLocal
from models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@auth_bp.post("/register")
def register():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    name = data.get("name", "")

    if not email or not password:
        return jsonify({"message": "email and password required"}), 400

    db = SessionLocal()
    try:
        user = User(email=email, name=name)
        user.set_password(password)
        db.add(user)
        db.commit()
        return jsonify({"message": "registered"}), 201
    except IntegrityError:
        db.rollback()
        return jsonify({"message": "email already in use"}), 409
    finally:
        db.close()

@auth_bp.post("/login")
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user or not user.check_password(password):
            return jsonify({"message": "invalid credentials"}), 401

        token = create_access_token(identity=str(user.id))
        return jsonify({
            "access_token": token,
            "user": {"id": user.id, "email": user.email, "name": user.name}
        }), 200
    finally:
        db.close()

@auth_bp.get("/me")
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user:
            return jsonify({"message": "not found"}), 404
        return jsonify({"id": user.id, "email": user.email, "name": user.name}), 200
    finally:
        db.close()
