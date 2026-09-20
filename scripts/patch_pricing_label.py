with open('src/constants/pricing/pricing.individuals.ts', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('priceYearly: "صفر ريال",', 'priceYearly: "بدون اشتراك",')

with open('src/constants/pricing/pricing.individuals.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated priceYearly to بدون اشتراك')
