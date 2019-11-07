#include "src/wasm/cpp/arcs.h"
#include "particles/Native/Wasm/example.h"  // generated by schema2wasm

class BasicParticle : public arcs::Particle {
public:
  BasicParticle() {
    registerHandle("foo", foo_);  // required for each handle declared in the manifest
    registerHandle("bar", bar_);
    autoRender();  // automatically render once handles are ready, and then when updated
  }

  // Rendering with template and key/value model
  std::string getTemplate(const std::string& slot_name) override {
    return R"(
      <div>Product is <b>{{name}}</b> <i>(sku <span>{{sku}}</span>)</i></div>
      <button on-click="clicky">Copy to output store</button> <span>{{num}}</span> clicks
      <br>
    )";
  }

  void populateModel(const std::string& slot_name, arcs::Dictionary* model) override {
    const arcs::BasicParticle_Foo& product = foo_.get();
    model->emplace("name", product.name());
    model->emplace("sku", arcs::num_to_str(product.sku()));
    model->emplace("num", arcs::num_to_str(num_clicks_));
  }

  // Responding to UI events
  void fireEvent(const std::string& slot_name, const std::string& handler, const arcs::Dictionary& eventData) override {
    if (handler == "clicky") {
      arcs::BasicParticle_Foo copy = arcs::clone_entity(foo_.get());  // does not copy internal entity id
      bar_.store(copy);    // 'copy' will be updated with a new internal id

      // Basic printf-style logging; note the c_str() for std::string variables
      console("Product copied; new id is %s\n", arcs::entity_to_str(copy).c_str());

      num_clicks_++;
      renderSlot("root", false, true);  // update display
    }
  }

private:
  arcs::Singleton<arcs::BasicParticle_Foo> foo_;
  arcs::Collection<arcs::BasicParticle_Bar> bar_;
  int num_clicks_ = 0;
};


class Watcher : public arcs::Particle {
public:
  Watcher() {
    registerHandle("bar", bar_);
    autoRender();
  }

  std::string getTemplate(const std::string& slot_name) override {
    return "<div><br>Watcher has seen <span>{{num}}</span> copies...<div>";
  }

  void populateModel(const std::string& slot_name, arcs::Dictionary* model) override {
    model->emplace("num", arcs::num_to_str(bar_.size()));
  }

private:
  arcs::Collection<arcs::Watcher_Bar> bar_;
};


// Set up the wasm API functions for creating each particle
DEFINE_PARTICLE(BasicParticle)
DEFINE_PARTICLE(Watcher)
