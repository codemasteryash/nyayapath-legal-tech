import json
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "data" / "knowledge" / "provisions.json"

CUES = {
    "DVA-3": "abused beaten hit struck pushed kicked threatened by husband by mother in law by family at home by brother in law by sister in law by relative by friend staying with me domestic relationship husband and wife married couple अभीरोध अत्याचार पति द्वारा सास द्वारा परिवार द्वारा मारा पीटा धक्का",
    "DVA-12": "apply magistrate how to file complaint application petition court paper work first step relief domestic violence अवेदन दायर करना अदालत",
    "DVA-17": "thrown out of the house told me to leave my home cannot stay with my husband shifted out staying at my parents no right in the property bought by in laws निवास घर से बाहर निकाल दिया मायके भेज दिया",
    "DVA-18": "stay away order do not contact me no phone calls order from court protection नजर रखना दूरी संपर्क आदेश",
    "DVA-20": "money financial support for rent for medicines pocket money खर्चा पैसा दवाई किराया",
    "DVA-21": "who will look after the children custody of my kids school बच्चों की देखभाल हिरासत",
    "DVA-27": "which court where do I go jurisdiction tehsil city district कहाँ कोर्ट अधिकार क्षेत्र",
    "DVA-29": "appeal against the order wrong decision by the magistrate अपील",
    "BNS-74": "he grabbed my hand he touched me he pushed me he tried to hug me he forced himself on me in the lift misbehaved with me physically अधिकार छूना गले पकड़ा स्पर्श",
    "BNS-75": "he keeps messaging me asking for sexual favours asking me to meet him alone sending obscene photos and videos repeated explicit messages lewd chats sexual request अनावश्यक मैसेज यौन प्रस्ताव गंदे फोटो",
    "BNS-78": "he follows me outside my house he keeps calling my number he keeps messaging my new number he monitors my social media he shows up at my office uninvited पीछा फोन नंबर नजर रखना",
    "BNS-79": "he made lewd comments in public he used obscene words he made gestures at me he passedcomments about my body अपशब्द गाली शरारत इशारे",
    "BNS-85": "for dowry they are asking my father to pay money after marriage my husband and his family keep demanding cash and gold dowry death threats if I do not bring money धोखाधड़ी नहीं दहेज की मांग पति ससुराल के लोगों ने पैसे की मांग",
    "BNS-86": "cruelty mental torture emotional abuse not allowed to eat not allowed to work",
    "BNS-115": "he hit me I have bruises I was beaten my arm is injured I was slapped I was pushed down चोट मारपीट गाली धक्का हाथ पर चोट",
    "BNS-117": "fracture my nose is broken I was hospitalised I was admitted for three days serious injury operation",
    "BNS-126": "he stopped me from going out he held me back he blocked the gate he did not let me leave the house अभीरोध बाहर नहीं जाने दिया रोका",
    "BNS-127": "he locked me in the room he kept me inside the house I was not allowed to go out बंद कर दिया अंदर रखा",
    "BNS-351": "he threatened to kill me he said he will ruin my family he threatened me on the phone he said he knows where I live धमकी जान से मालूम करा देना",
    "BNS-329": "he entered my house without permission he broke the lock he came inside while I was away घर में घुसा ताला तोड़ा",
    "BNS-315": "he took my money he used my money he took my phone and money he kept my jewellery",
    "BNS-63": "he forced me he did not use a condom he was drunk he drugged my drink",
    "BNSS-173": "how to file an FIR where do I go to the police they did not register my complaint they refused to write my statement I want a copy of the FIR पुलिस शिकायत एफआईआर लिखाने से मना कॉपी",
    "BNSS-145": "he does not give me money for the child he has stopped paying for my expenses maintenance बच्चे का खर्चा गुजारा भरण पोषण",
    "BNSS-184": "hospital examination for me I need a medical test I was assaulted doctor report",
    "ITACT-43": "I clicked a link and entered my OTP money was debited from my account someone called pretending to be from the bank I lost money in online fraud क्लिक किया ओटीपी पैसे उड़ गए बैंक का नाम बताकर",
    "ITACT-66E": "my private photos were leaked my intimate video was circulated without my consent morphed photos निजता तस्वीरें फैल गईं",
    "ITACT-66F": "he sent me threatening messages on my phone abusive messages degrading messages",
    "ITACT-67": "obscene videos were forwarded on my phone someone sent me obscene material",
    "ITACT-69": "bank did not stop the transaction I reported to the RBI cyber cell helpline",
    "NI-138": "my cheque bounced the bank returned my cheque insufficient funds I did not pay the debt I issued a cheque for the loan amount चेक वापस लौटा पैसे नहीं थे",
    "LSA-12C": "I cannot afford a lawyer I need free legal help I want a lawyer appointed for me मुफ्त वकील लोनामंद",
    "POSH-3": "at my office my manager passed remarks about my appearance he follows me at office he asks me to sit closer",
    "POSH-6": "I filed a complaint with the internal committee at the office the ICC did not take action महिला समिति शिकायत ऑफिस",
    "CPA-2-11": "the service was poor they did not respond they promised a refund and did not deliver the service was defective",
    "CPA-35": "I want to file a consumer complaint against the seller I bought a defective product from an online shop",
    "CPA-47": "my claim is worth more than one crore which commission should I approach",
    "CPA-62": "the company is in another state I want to transfer my complaint",
    "POCSO-19": "a child told me that something happened to her I must report this I saw something happening to a minor बच्ची ने बताया बालिका",
    "POCSO-21": "I did not report it I was afraid I did not tell the police in time",
    "POCSO-28": "which special court will hear this case where is the children court",
    "POCSO-40": "the child needs a lawyer the child should have representation",
    "BNS-124": "he threw acid my face was burnt acid attack acid",
    "BNS-76": "he tried to strip me he pulled my clothes he tried to undress me कपड़े उतारने",
    "BNS-77": "hidden camera recording photographs of me a camera was installed in my room",
}


def main() -> int:
    with PATH.open(encoding="utf-8") as f:
        doc = json.load(f)

    applied, missing = 0, []
    for prov in doc["provisions"]:
        cue = CUES.get(prov["id"])
        if cue:
            prov["narrativeCues"] = cue
            applied += 1
        else:
            missing.append(prov["id"])

    with PATH.open("w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"narrativeCues applied to {applied} provisions")
    if missing:
        print("no cues for:", ", ".join(missing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())