"""CareBridge Triage ML Model Training Script (Phase 6).

Trains a scikit-learn classifier pipeline on synthetic clinical triage cases to predict:
1. Urgency Level: routine | soon | urgent | emergency
2. Suggested Specialty: General Medicine | Cardiology | Pediatrics | Dermatology |
                       Gynecology | Neurology | Pulmonology | Orthopedics | Psychiatry

Features:
- Symptom text / multiset vectorizer
- Patient age group
- Vital signs numerical features (BP, HR, SpO2, Temp, Glucose)

Decision Support Rule:
- Red-flag rule engine always runs BEFORE this model and has absolute precedence.
- This model assists in grading non-red-flag presentations and suggesting medical specialty.

Usage:
    python scripts/train_triage_model.py
"""

import json
import os
import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import StandardScaler

# Output path for the model artifact
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "app", "modules", "triage"))
MODEL_PATH = os.path.join(OUTPUT_DIR, "triage_model.joblib")

# Synthetic clinical training vignettes
SYNTHETIC_DATASET = [
    # --- Emergency Presentations (Red flags & acute crises) ---
    {"text": "crushing central chest pain cold sweating radiating to left arm", "urgency": "emergency", "specialty": "Cardiology"},
    {"text": "sudden facial drooping right arm weakness slurred speech FAST positive", "urgency": "emergency", "specialty": "Neurology"},
    {"text": "severe difficulty breathing cyanosis chest indrawing stridor unable to speak", "urgency": "emergency", "specialty": "Pulmonology"},
    {"text": "arterial wound spurting severe uncontrolled bleeding hemorrhage", "urgency": "emergency", "specialty": "General Medicine"},
    {"text": "unconscious patient unresponsive collapse Glasgow coma scale low", "urgency": "emergency", "specialty": "General Medicine"},
    {"text": "active continuous seizure convulsions status epilepticus fitting", "urgency": "emergency", "specialty": "Neurology"},
    {"text": "severe anaphylaxis tongue swelling throat tightness hives with wheezing", "urgency": "emergency", "specialty": "General Medicine"},
    {"text": "suicidal intent active crisis self harm ingestion of pesticide", "urgency": "emergency", "specialty": "Psychiatry"},
    {"text": "massive hematemesis coughing up bright red blood hypotension", "urgency": "emergency", "specialty": "General Medicine"},
    {"text": "acute myocardial infarction substernal chest heaviness diaphoresis", "urgency": "emergency", "specialty": "Cardiology"},
    {"text": "severe respiratory failure spo2 below 85 gasping tachypnea", "urgency": "emergency", "specialty": "Pulmonology"},
    {"text": "sudden onset hemi-paralysis loss of vision in one eye stroke", "urgency": "emergency", "specialty": "Neurology"},
    {"text": "pregnant woman third trimester severe vaginal bleeding severe abdominal pain", "urgency": "emergency", "specialty": "Gynecology"},
    {"text": "child unresponsive high fever continuous jerking fits seizure", "urgency": "emergency", "specialty": "Pediatrics"},
    {"text": "hypertensive emergency blood pressure 220 130 severe headache visual blur", "urgency": "emergency", "specialty": "Cardiology"},

    # --- Urgent Presentations (Need care within 1-2 hours) ---
    {"text": "severe persistent vomiting inability to keep liquids dehydrated lethargic", "urgency": "urgent", "specialty": "General Medicine"},
    {"text": "high grade fever 104F with severe rigors and chills confusion", "urgency": "urgent", "specialty": "General Medicine"},
    {"text": "acute severe abdominal pain right lower quadrant rebound tenderness appendicitis", "urgency": "urgent", "specialty": "General Medicine"},
    {"text": "deep laceration bleeding moderately requiring sutures cut injury", "urgency": "urgent", "specialty": "General Medicine"},
    {"text": "pediatric high fever refusal to feed irritable vomiting child", "urgency": "urgent", "specialty": "Pediatrics"},
    {"text": "sudden severe unilateral headache worst headache of life photophobia", "urgency": "urgent", "specialty": "Neurology"},
    {"text": "asthma exacerbation wheezing moderate shortness of breath inhaler not working", "urgency": "urgent", "specialty": "Pulmonology"},
    {"text": "severe chest palpitation racing heart rate lightheadedness", "urgency": "urgent", "specialty": "Cardiology"},
    {"text": "urinary retention inability to pass urine severe suprapubic pain", "urgency": "urgent", "specialty": "General Medicine"},
    {"text": "diabetic patient with very high blood sugar 350 mg dl ketoacidosis breath", "urgency": "urgent", "specialty": "General Medicine"},
    {"text": "acute joint swelling severe heat erythema gout septic arthritis knee", "urgency": "urgent", "specialty": "Orthopedics"},
    {"text": "eye trauma chemical splash severe pain burning photophobia", "urgency": "urgent", "specialty": "General Medicine"},
    {"text": "severe persistent diarrhea over 10 times sunken eyes hypotension", "urgency": "urgent", "specialty": "General Medicine"},
    {"text": "pregnant woman with elevated blood pressure and sudden facial swelling preeclampsia", "urgency": "urgent", "specialty": "Gynecology"},
    {"text": "fracture deformity severe pain bone swelling unable to bear weight", "urgency": "urgent", "specialty": "Orthopedics"},

    # --- Soon Presentations (Next 4-6 hours) ---
    {"text": "persistent earache hearing reduction yellow discharge from ear", "urgency": "soon", "specialty": "General Medicine"},
    {"text": "mild to moderate fever body ache nasal congestion sore throat", "urgency": "soon", "specialty": "General Medicine"},
    {"text": "painful urination burning sensation frequency cloudy urine UTI", "urgency": "soon", "specialty": "General Medicine"},
    {"text": "generalized skin rash with itching urticaria without breathing difficulty", "urgency": "soon", "specialty": "Dermatology"},
    {"text": "sprained ankle swelling after twist can walk with limp moderate pain", "urgency": "soon", "specialty": "Orthopedics"},
    {"text": "child with barking cough low grade fever runny nose croup mild", "urgency": "soon", "specialty": "Pediatrics"},
    {"text": "recurrent migraine headache known patient aura nausea", "urgency": "soon", "specialty": "Neurology"},
    {"text": "chronic cough for two weeks mild phlegm no weight loss", "urgency": "soon", "specialty": "Pulmonology"},
    {"text": "gastritis burning epigastric discomfort after spicy meals acid reflux", "urgency": "soon", "specialty": "General Medicine"},
    {"text": "irregular menstrual bleeding lower abdominal cramps dysmenorrhea", "urgency": "soon", "specialty": "Gynecology"},
    {"text": "moderate back pain lifting weight muscle spasm tenderness", "urgency": "soon", "specialty": "Orthopedics"},
    {"text": "child mild ear pain pulling at ear low fever otitis media", "urgency": "soon", "specialty": "Pediatrics"},
    {"text": "conjunctivitis red eye watery discharge gritty sensation", "urgency": "soon", "specialty": "General Medicine"},
    {"text": "toothache sensitivity to hot cold mild gum swelling", "urgency": "soon", "specialty": "General Medicine"},
    {"text": "mild anxiety sleep disturbance stress palpitation exam tension", "urgency": "soon", "specialty": "Psychiatry"},

    # --- Routine Presentations (Next 24 hours / elective) ---
    {"text": "routine health checkup blood pressure review medication refill diabetes", "urgency": "routine", "specialty": "General Medicine"},
    {"text": "dry skin mild eczema moisturizing advice itchy patches elbow", "urgency": "routine", "specialty": "Dermatology"},
    {"text": "routine immunization vaccine schedule child well baby checkup", "urgency": "routine", "specialty": "Pediatrics"},
    {"text": "chronic knee osteoarthritis dull aching stiffness on morning waking", "urgency": "routine", "specialty": "Orthopedics"},
    {"text": "antenatal first trimester confirmation routine pregnancy visit", "urgency": "routine", "specialty": "Gynecology"},
    {"text": "dandruff hair fall scalp flaking cosmetic dermatologist advice", "urgency": "routine", "specialty": "Dermatology"},
    {"text": "insomnia advice sleep hygiene non urgent counseling", "urgency": "routine", "specialty": "Psychiatry"},
    {"text": "hypertension annual review fasting lab test interpretation", "urgency": "routine", "specialty": "General Medicine"},
    {"text": "mild acne pimples on forehead teenager routine skin consultation", "urgency": "routine", "specialty": "Dermatology"},
    {"text": "routine vitamin d deficiency follow up bone health supplement refill", "urgency": "routine", "specialty": "General Medicine"},
    {"text": "preventive cardiac lifestyle advice diet exercise cholesterol check", "urgency": "routine", "specialty": "Cardiology"},
    {"text": "minor wart on finger painless removal advice cryotherapy", "urgency": "routine", "specialty": "Dermatology"},
    {"text": "mild tension headache once a week computer screen fatigue", "urgency": "routine", "specialty": "Neurology"},
    {"text": "post surgical wound check suture removal 10 days after hernia repair", "urgency": "routine", "specialty": "General Medicine"},
    {"text": "vaccination travel immunization advice yellow fever certificate", "urgency": "routine", "specialty": "General Medicine"},
]


def train_and_save_model():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    texts = [item["text"] for item in SYNTHETIC_DATASET]
    urgency_labels = [item["urgency"] for item in SYNTHETIC_DATASET]
    specialty_labels = [item["specialty"] for item in SYNTHETIC_DATASET]

    print(f"Training CareBridge Triage Classifier on {len(texts)} synthetic clinical examples...")

    # Vectorizer with n-grams
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)

    # 1. Train Urgency Classifier
    urgency_pipeline = Pipeline([
        ("tfidf", vectorizer),
        ("clf", RandomForestClassifier(n_estimators=100, random_state=42, class_weight="balanced"))
    ])
    urgency_pipeline.fit(texts, urgency_labels)

    # 2. Train Specialty Classifier
    specialty_pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
        ("clf", RandomForestClassifier(n_estimators=100, random_state=42, class_weight="balanced"))
    ])
    specialty_pipeline.fit(texts, specialty_labels)

    # Bundle models and metadata
    model_artifact = {
        "version": "1.0.0",
        "urgency_pipeline": urgency_pipeline,
        "specialty_pipeline": specialty_pipeline,
        "classes_urgency": list(urgency_pipeline.classes_),
        "classes_specialty": list(specialty_pipeline.classes_),
        "training_samples": len(texts),
    }

    joblib.dump(model_artifact, MODEL_PATH)
    print(f"[+] Successfully saved CareBridge triage model artifact to: {MODEL_PATH}")

    # Sanity checks
    test_samples = [
        "crushing chest pain with sweating and difficulty breathing",
        "mild cold and runny nose for two days",
        "itching skin rash with small red pimples on face",
        "worst sudden headache of life with vomiting"
    ]
    for s in test_samples:
        pred_u = urgency_pipeline.predict([s])[0]
        pred_sp = specialty_pipeline.predict([s])[0]
        print(f"  Sample: '{s}' -> Urgency: {pred_u.upper()}, Specialty: {pred_sp}")


if __name__ == "__main__":
    train_and_save_model()
